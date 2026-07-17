use std::net::{IpAddr, Ipv4Addr};

/// Geographic location information for a remote IP address.
#[derive(Debug, Clone)]
pub struct GeoInfo {
    pub country: String,
    pub city: String,
    pub lat: f64,
    pub lon: f64,
}

/// Returns `true` if the IP address is in a private, loopback, or link-local range.
fn is_private_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_multicast()
                || v4.is_broadcast()
                || v4.is_unspecified()
                || v4.octets()[0] == 0
        }
        IpAddr::V6(v6) => {
            // Handle IPv4-mapped addresses like ::ffff:192.168.1.1
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_private_ip(&IpAddr::V4(v4));
            }
            v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                // fe80::/10 — check first 10 bits: first octet must be 0xfe, second must start with 10xxxxxx
                || (v6.octets()[0] == 0xfe && (v6.octets()[1] & 0xC0) == 0x80)
        }
    }
}

/// Attempt to return GeoInfo for a known public IPv4 address.
fn known_v4(v4: Ipv4Addr) -> Option<GeoInfo> {
    let o = v4.octets();

    // Exact matches for well-known DNS
    let exact = match (o[0], o[1], o[2], o[3]) {
        (8, 8, 8, 8) | (8, 8, 4, 4) => Some(("US", "Mountain View", 37.4056, -122.0775)),
        (1, 1, 1, 1) | (1, 0, 0, 1) => Some(("US", "San Francisco", 37.7749, -122.4194)),
        _ => None,
    };
    if let Some((country, city, lat, lon)) = exact {
        return Some(GeoInfo {
            country: country.into(),
            city: city.into(),
            lat,
            lon,
        });
    }

    // Range-based matches
    let result = match o[0] {
        // GitHub: 140.82.112.0/20
        140 if o[1] == 82 && (o[2] & 0xF0) == 0x70 => ("US", "San Francisco", 37.7749, -122.4194),
        // Google: 142.250.0.0/15
        142 if (o[1] & 0xFE) == 250 => ("US", "Mountain View", 37.4056, -122.0775),
        // Cloudflare CDN: 104.16.0.0/12
        104 if (o[1] & 0xF0) == 0x10 => ("US", "San Francisco", 37.7749, -122.4194),
        // AWS: 52.0.0.0/10
        52 if (o[1] & 0xC0) == 0x00 => ("US", "Ashburn", 39.0438, -77.4874),
        // AWS: 54.0.0.0/8
        54 => ("US", "Ashburn", 39.0438, -77.4874),
        // Azure: 20.0.0.0/8
        20 => ("US", "Redmond", 47.6740, -122.1215),
        // Azure: 40.0.0.0/8
        40 => ("US", "Redmond", 47.6740, -122.1215),
        // All other public IPs
        _ => return Some(GeoInfo {
            country: "Unknown".into(),
            city: "Unknown".into(),
            lat: 0.0,
            lon: 0.0,
        }),
    };

    Some(GeoInfo {
        country: result.0.into(),
        city: result.1.into(),
        lat: result.2,
        lon: result.3,
    })
}

/// Look up geographic information for a remote IP address.
///
/// Phase 3 implementation: offline stub for well-known public IP ranges.
/// Private/local/multicast addresses return `None` without any I/O.
///
/// Future phases can integrate an online API (e.g. ip-api.com, ipinfo.io)
/// or an offline MMDB file (MaxMind GeoLite2) for full coverage.
pub fn lookup_geoip(ip: &str) -> Option<GeoInfo> {
    let addr: IpAddr = ip.parse().ok()?;

    if is_private_ip(&addr) {
        return None;
    }

    // Delegate IPv4-mapped IPv6 addresses (e.g. ::ffff:8.8.8.8) to the IPv4 lookup
    let addr = match addr {
        IpAddr::V6(v6) => v6.to_ipv4_mapped().map(IpAddr::V4).unwrap_or(addr),
        _ => addr,
    };

    match addr {
        IpAddr::V4(v4) => known_v4(v4),
        IpAddr::V6(_) => Some(GeoInfo {
            country: "Unknown".into(),
            city: "Unknown".into(),
            lat: 0.0,
            lon: 0.0,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_private_ip_returns_none() {
        assert!(lookup_geoip("127.0.0.1").is_none());
        assert!(lookup_geoip("192.168.1.1").is_none());
        assert!(lookup_geoip("10.0.0.1").is_none());
        assert!(lookup_geoip("172.16.0.1").is_none());
        assert!(lookup_geoip("169.254.1.1").is_none());
        assert!(lookup_geoip("0.0.0.0").is_none());
        assert!(lookup_geoip("::1").is_none());
    }

    #[test]
    fn test_known_public_ip_returns_location() {
        let result = lookup_geoip("8.8.8.8");
        assert!(result.is_some());
        let info = result.unwrap();
        assert_eq!(info.country, "US");
        assert_eq!(info.city, "Mountain View");
    }

    #[test]
    fn test_cloudflare_dns() {
        let result = lookup_geoip("1.1.1.1");
        assert!(result.is_some());
        assert_eq!(result.unwrap().city, "San Francisco");
    }

    #[test]
    fn test_aws_range() {
        let result = lookup_geoip("52.12.110.1");
        assert!(result.is_some());
        assert_eq!(result.unwrap().city, "Ashburn");
    }

    #[test]
    fn test_azure_range() {
        let result = lookup_geoip("20.0.0.1");
        assert!(result.is_some());
        assert_eq!(result.unwrap().city, "Redmond");
    }

    #[test]
    fn test_unknown_public_ip_returns_default() {
        let result = lookup_geoip("203.0.113.1");
        assert!(result.is_some());
        assert_eq!(result.unwrap().country, "Unknown");
    }

    #[test]
    fn test_invalid_ip_returns_none() {
        assert!(lookup_geoip("not-an-ip").is_none());
        assert!(lookup_geoip("").is_none());
        assert!(lookup_geoip("256.256.256.256").is_none());
    }

    #[test]
    fn test_ipv4_mapped_private() {
        // ::ffff:192.168.1.1 is a private IPv4 address mapped to IPv6
        assert!(lookup_geoip("::ffff:192.168.1.1").is_none());
    }

    #[test]
    fn test_ipv4_mapped_known() {
        // ::ffff:8.8.8.8 should resolve to the same as 8.8.8.8
        let result = lookup_geoip("::ffff:8.8.8.8");
        assert!(result.is_some());
        assert_eq!(result.unwrap().city, "Mountain View");
    }

    #[test]
    fn test_ipv6_link_local() {
        // fe80::1 is link-local (private)
        assert!(lookup_geoip("fe80::1").is_none());
        // fe81::1 is also link-local under fe80::/10
        assert!(lookup_geoip("fe81::1").is_none());
        // febf::1 is the top of the fe80::/10 range
        assert!(lookup_geoip("febf::1").is_none());
    }

    #[test]
    fn test_github_range_boundaries() {
        // 140.82.112.0/20 — lower boundary
        assert_eq!(lookup_geoip("140.82.112.1").unwrap().city, "San Francisco");
        // 140.82.127.255 — upper boundary
        assert_eq!(lookup_geoip("140.82.127.255").unwrap().city, "San Francisco");
        // 140.82.128.1 — just outside (/20 boundary)
        assert_eq!(lookup_geoip("140.82.128.1").unwrap().country, "Unknown");
    }

    #[test]
    fn test_cloudflare_cdn_boundaries() {
        // 104.16.0.0/12 — lower boundary
        assert_eq!(lookup_geoip("104.16.0.1").unwrap().city, "San Francisco");
        // 104.31.255.255 — upper boundary
        assert_eq!(lookup_geoip("104.31.255.255").unwrap().city, "San Francisco");
        // 104.32.0.1 — just outside
        assert_eq!(lookup_geoip("104.32.0.1").unwrap().country, "Unknown");
    }

    #[test]
    fn test_aws_boundaries() {
        // 52.0.0.0/10 — lower boundary
        assert_eq!(lookup_geoip("52.0.0.1").unwrap().city, "Ashburn");
        // 52.63.255.255 — upper boundary
        assert_eq!(lookup_geoip("52.63.255.255").unwrap().city, "Ashburn");
        // 52.64.0.1 — just outside /10
        assert_eq!(lookup_geoip("52.64.0.1").unwrap().country, "Unknown");
        // 54.0.0.0/8
        assert_eq!(lookup_geoip("54.0.0.1").unwrap().city, "Ashburn");
        assert_eq!(lookup_geoip("54.255.255.255").unwrap().city, "Ashburn");
    }

    #[test]
    fn test_multicast_broadcast_private() {
        assert!(lookup_geoip("224.0.0.1").is_none());
        assert!(lookup_geoip("255.255.255.255").is_none());
        assert!(lookup_geoip("0.42.42.42").is_none());
        assert!(lookup_geoip("::ffff:224.0.0.1").is_none());
    }
}
