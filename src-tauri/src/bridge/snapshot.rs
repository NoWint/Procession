use crate::types::SystemSnapshot;

pub fn preprocess_snapshot(mut snapshot: SystemSnapshot, max_processes: usize) -> SystemSnapshot {
    snapshot
        .processes
        .sort_by(|a, b| b.cpu.partial_cmp(&a.cpu).unwrap_or(std::cmp::Ordering::Equal));
    snapshot.processes.truncate(max_processes);
    snapshot
}
