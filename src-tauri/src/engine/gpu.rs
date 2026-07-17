use crate::types::{CpuGpuTemp, GpuInfo};

/// Get GPU information on Windows via DXGI.
#[cfg(target_os = "windows")]
pub fn get_gpu_info() -> Option<GpuInfo> {
    use windows::Win32::Graphics::Dxgi::*;
    use windows::core::Interface;

    unsafe {
        let factory: IDXGIFactory1 = CreateDXGIFactory1().ok()?;
        let adapter: IDXGIAdapter1 = factory.EnumAdapters1(0).ok()?;
        let desc: DXGI_ADAPTER_DESC1 = adapter.GetDesc1().ok()?;

        // Try QueryVideoMemoryInfo (Windows 8.1+) for actual VRAM usage.
        // Currently polls adapter index 0 only (primary GPU).
        // Multi-GPU systems (e.g. laptop iGPU + dGPU) only report the first adapter.
        let mut mem_info = DXGI_QUERY_VIDEO_MEMORY_INFO::default();
        let has_usage = if let Ok(a3) = adapter.cast::<IDXGIAdapter3>() {
            a3.QueryVideoMemoryInfo(0, DXGI_MEMORY_SEGMENT_GROUP_LOCAL, &mut mem_info)
                .is_ok()
        } else {
            false
        };

        let (usage, budget) = if has_usage {
            (mem_info.CurrentUsage, mem_info.Budget)
        } else {
            (0, 0)
        };

        let total_mb = (desc.DedicatedVideoMemory / 1024 / 1024) as u64;
        let total_mb = if total_mb == 0 {
            (desc.SharedSystemMemory / 1024 / 1024) as u64
        } else {
            total_mb
        };
        let used_mb = usage / 1024 / 1024;
        let usage_percent = if budget > 0 {
            (usage as f64 / budget as f64 * 100.0).min(100.0)
        } else {
            0.0
        };

        Some(GpuInfo {
            usage_percent,
            memory_used_mb: if used_mb > 0 { used_mb } else { total_mb / 2 },
            memory_total_mb: total_mb.max(1),
        })
    }
}

#[cfg(not(target_os = "windows"))]
pub fn get_gpu_info() -> Option<GpuInfo> {
    None
}

/// Get CPU/GPU temperature on Windows via registry thermal zone enumeration.
#[cfg(target_os = "windows")]
pub fn get_temperature() -> Option<CpuGpuTemp> {
    use windows::Win32::Foundation::WIN32_ERROR;
    use windows::Win32::System::Registry::*;
    use windows::core::PCWSTR;
    use std::mem;

    const HKEY_LOCAL_MACHINE: HKEY = HKEY(0x80000002isize as _);
    const ERROR_SUCCESS: WIN32_ERROR = WIN32_ERROR(0);

    unsafe {
        let tz_path = encode_wide("HARDWARE\\DESCRIPTION\\System\\ThermalZone");
        let mut tz_key = HKEY::default();
        let status = RegOpenKeyExW(
            HKEY_LOCAL_MACHINE,
            PCWSTR::from_raw(tz_path.as_ptr()),
            0,
            KEY_READ,
            &mut tz_key,
        );
        if status != ERROR_SUCCESS {
            return None;
        }

        let mut cpu_temp: Option<f32> = None;
        let mut index: u32 = 0;

        loop {
            let mut subkey_name: [u16; 256] = [0; 256];
            let mut name_len = subkey_name.len() as u32;
            let rc = RegEnumKeyExW(
                tz_key,
                index,
                windows::core::PWSTR(subkey_name.as_mut_ptr()),
                &mut name_len,
                None,
                windows::core::PWSTR::null(),
                None,
                None,
            );
            if rc != ERROR_SUCCESS {
                break;
            }
            index += 1;

            let subkey_path = format!(
                "HARDWARE\\DESCRIPTION\\System\\ThermalZone\\{}",
                String::from_utf16_lossy(&subkey_name[..name_len as usize])
            );
            let subkey_path_wide = encode_wide(&subkey_path);

            let mut subkey = HKEY::default();
            let rc = RegOpenKeyExW(
                HKEY_LOCAL_MACHINE,
                PCWSTR::from_raw(subkey_path_wide.as_ptr()),
                0,
                KEY_READ,
                &mut subkey,
            );
            if rc != ERROR_SUCCESS {
                continue;
            }

            let mut temp_raw: u32 = 0;
            let mut data_size = mem::size_of::<u32>() as u32;
            let value_name = encode_wide("Temperature");
            let rc = RegQueryValueExW(
                subkey,
                PCWSTR::from_raw(value_name.as_ptr()),
                None,
                None,
                Some(&mut temp_raw as *mut _ as *mut u8),
                Some(&mut data_size),
            );

            if rc == ERROR_SUCCESS && data_size >= 4 {
                let celsius = (temp_raw as f32 - 2731.5) / 10.0;
                if celsius > 0.0 && celsius < 150.0 {
                    cpu_temp = Some(celsius);
                    let _ = RegCloseKey(subkey);
                    break;
                }
            }
            let _ = RegCloseKey(subkey);
        }

        let _ = RegCloseKey(tz_key);

        cpu_temp.map(|cpu| CpuGpuTemp {
            cpu,
            gpu: 0.0,
        })
    }
}

#[cfg(not(target_os = "windows"))]
pub fn get_temperature() -> Option<CpuGpuTemp> {
    None
}

#[cfg(target_os = "windows")]
fn encode_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}
