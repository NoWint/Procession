use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("snapshot not available")]
    NoSnapshot,

    #[error("process {0} not found")]
    ProcessNotFound(u64),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("{0}")]
    Other(String),
}

impl From<AppError> for String {
    fn from(e: AppError) -> String {
        e.to_string()
    }
}
