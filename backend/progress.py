"""
Progress tracking for background removal tasks.
"""
import asyncio
import uuid
from dataclasses import dataclass, field
from typing import Optional, Callable
from enum import Enum
import time


class TaskStatus(str, Enum):
    PENDING = "pending"
    LOADING_MODEL = "loading_model"
    PROCESSING = "processing"
    POST_PROCESSING = "post_processing"
    ENCODING = "encoding"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class TaskProgress:
    """Progress information for a task."""
    task_id: str
    status: TaskStatus
    progress: int  # 0-100
    message: str
    result: Optional[dict] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)


# In-memory task storage (for single-server deployment)
_tasks: dict[str, TaskProgress] = {}


def create_task() -> str:
    """Create a new task and return its ID."""
    task_id = str(uuid.uuid4())[:8]
    _tasks[task_id] = TaskProgress(
        task_id=task_id,
        status=TaskStatus.PENDING,
        progress=0,
        message="Starting...",
    )
    return task_id


def update_task(
    task_id: str,
    status: TaskStatus,
    progress: int,
    message: str,
    result: Optional[dict] = None,
    error: Optional[str] = None,
):
    """Update task progress."""
    if task_id in _tasks:
        _tasks[task_id].status = status
        _tasks[task_id].progress = progress
        _tasks[task_id].message = message
        if result is not None:
            _tasks[task_id].result = result
        if error is not None:
            _tasks[task_id].error = error


def get_task(task_id: str) -> Optional[TaskProgress]:
    """Get task progress by ID."""
    return _tasks.get(task_id)


def cleanup_old_tasks(max_age_seconds: int = 300):
    """Remove tasks older than max_age_seconds."""
    now = time.time()
    to_remove = [
        task_id
        for task_id, task in _tasks.items()
        if now - task.created_at > max_age_seconds
    ]
    for task_id in to_remove:
        del _tasks[task_id]


class ProgressCallback:
    """Context manager for reporting progress during processing."""

    def __init__(self, task_id: str):
        self.task_id = task_id

    def report(self, status: TaskStatus, progress: int, message: str):
        """Report progress update."""
        update_task(self.task_id, status, progress, message)

    def loading_model(self, model_name: str):
        """Report model loading progress."""
        self.report(TaskStatus.LOADING_MODEL, 10, f"Loading {model_name} model...")

    def model_loaded(self):
        """Report model loaded."""
        self.report(TaskStatus.LOADING_MODEL, 30, "Model loaded")

    def processing(self, progress: int = 50):
        """Report processing progress."""
        self.report(TaskStatus.PROCESSING, progress, "Processing image...")

    def post_processing(self):
        """Report post-processing."""
        self.report(TaskStatus.POST_PROCESSING, 80, "Refining edges...")

    def encoding(self):
        """Report encoding."""
        self.report(TaskStatus.ENCODING, 90, "Encoding result...")

    def complete(self, result: dict):
        """Report completion with result."""
        update_task(
            self.task_id,
            TaskStatus.COMPLETED,
            100,
            "Complete",
            result=result,
        )

    def fail(self, error: str):
        """Report failure."""
        update_task(
            self.task_id,
            TaskStatus.FAILED,
            0,
            "Failed",
            error=error,
        )
