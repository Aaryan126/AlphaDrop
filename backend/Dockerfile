FROM python:3.11-slim

WORKDIR /app

# Set home directory for model storage
ENV HOME=/app
ENV U2NET_HOME=/app/.u2net

# Install system dependencies for OpenCV and image processing
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download rembg models during build (so they're baked into the image)
RUN mkdir -p /app/.u2net && \
    python -c "from rembg import new_session; new_session('u2net')" && \
    python -c "from rembg import new_session; new_session('u2net_human_seg')" && \
    ls -la /app/.u2net/

# Copy application code
COPY . .

# Cloud Run uses PORT env variable (default 8080)
ENV PORT=8080
EXPOSE 8080

# Run the application
CMD exec uvicorn main:app --host 0.0.0.0 --port $PORT
