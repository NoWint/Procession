use crate::types::SystemSnapshot;

/// Ring buffer cache of recent SystemSnapshots.
/// Capacity is bounded (default 1000) — older entries are overwritten.
/// Supports the `cmd_get_snapshot` request/response path and lays
/// groundwork for Phase 5 time-playback.
pub struct CacheBuffer {
    buffer: Vec<SystemSnapshot>,
    capacity: usize,
    write_pos: usize,
}

impl CacheBuffer {
    pub fn new(capacity: usize) -> Self {
        let cap = capacity.min(1000);
        Self {
            buffer: Vec::with_capacity(cap),
            capacity: cap,
            write_pos: 0,
        }
    }

    pub fn push(&mut self, snapshot: SystemSnapshot) {
        if self.buffer.len() < self.capacity {
            self.buffer.push(snapshot);
        } else {
            self.buffer[self.write_pos % self.capacity] = snapshot;
        }
        self.write_pos += 1;
    }

    pub fn get_latest(&self) -> Option<&SystemSnapshot> {
        if self.buffer.is_empty() {
            None
        } else {
            Some(&self.buffer[(self.write_pos - 1) % self.capacity])
        }
    }

    #[allow(dead_code)]
    pub fn len(&self) -> usize {
        self.buffer.len().min(self.capacity)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_snapshot(timestamp: u64) -> SystemSnapshot {
        SystemSnapshot {
            processes: vec![],
            cpu: Default::default(),
            memory: Default::default(),
            network: Default::default(),
            disk: Default::default(),
            gpu: None,
            temperature: None,
            process_relations: vec![],
            listening_ports: vec![],
            fs_hotspots: vec![],
            plugins: std::collections::HashMap::new(),
            timestamp,
            stale: false,
        }
    }

    #[test]
    fn test_cache_ring_buffer_wraparound() {
        let mut cache = CacheBuffer::new(3);
        for i in 0..5 {
            cache.push(dummy_snapshot(i));
        }
        assert_eq!(cache.get_latest().unwrap().timestamp, 4);
        assert_eq!(cache.len(), 3);
    }

    #[test]
    fn test_cache_empty() {
        let cache = CacheBuffer::new(10);
        assert!(cache.get_latest().is_none());
        assert_eq!(cache.len(), 0);
    }

    #[test]
    fn test_cache_single_entry() {
        let mut cache = CacheBuffer::new(10);
        cache.push(dummy_snapshot(42));
        assert_eq!(cache.get_latest().unwrap().timestamp, 42);
        assert_eq!(cache.len(), 1);
    }
}
