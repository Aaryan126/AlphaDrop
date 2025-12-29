# CLAUDE.md — Coding & Architecture Guidelines

## Purpose
This document defines **engineering best practices**, **architecture principles**, and **tech stack expectations** for building a modern Chrome extension backed by ML services.  
Claude should prioritize **clean design, maintainability, and correctness** over rapid prototyping hacks.

---

## Core Engineering Principles

### 1. Separation of Concerns
- Keep **UI, business logic, and ML inference** strictly separated
- Chrome extension = UI + orchestration only
- Heavy computation belongs on the backend or in isolated workers

### 2. Deterministic First, ML Second
- Prefer **rule-based logic** when possible
- ML should enhance decisions, not replace simple heuristics
- Every automated decision should be explainable

### 3. Fail Gracefully
- Always provide fallbacks
- Never fail silently
- If one engine/method fails, degrade to a simpler one

---

## Chrome Extension Best Practices

### Manifest & Security
- Use **Manifest V3**
- Minimize permissions
- Avoid persistent background logic unless necessary
- Treat all external images as untrusted input

### Architecture
- Background service worker:
  - API calls
  - Decision routing
- Content / popup UI:
  - Rendering only
  - No heavy processing
- Use message passing, not shared state

### Performance
- Never block the UI thread
- Use:
  - Web Workers
  - Offscreen Canvas
- Prefer async, promise-based flows everywhere

---

## Backend & API Design

### API Principles
- Stateless endpoints
- Explicit inputs/outputs
- Versioned routes (`/v1/`, `/v2/`)
- Always return:
  - result
  - metadata
  - confidence or status indicators

### Backend Stack
- FastAPI for clarity and speed
- Pydantic for validation
- Structured logging (JSON logs preferred)

### ML Inference
- Models should be:
  - Hot-loaded
  - Reusable
  - Isolated per engine
- Avoid model-specific logic leaking into API layers

---

## ML & Image Processing Guidelines

### Model Usage
- Treat models as interchangeable engines
- Standardize input/output formats:
  - Input: RGB image
  - Output: mask / alpha + confidence

### Heuristics
- Lightweight, deterministic methods are encouraged
- OpenCV-style pipelines are ideal for:
  - fast paths
  - offline fallback
- Always document why a heuristic exists

---

## Auto-Decision Logic

### v1 Approach
- Rule-based selection
- Feature-driven logic (edges, color stats, faces, etc.)
- No black-box decisions

### Future Expansion
- Allow logging of user overrides
- Data collection must be:
  - anonymized
  - optional
  - minimal

---

## Code Quality Expectations

### Style
- Small, composable functions
- Clear naming over cleverness
- Prefer readability to micro-optimizations

### Errors & Logging
- Explicit error types
- Actionable error messages
- Log decisions, not just failures

### Testing
- Unit test:
  - decision logic
  - image preprocessing
- Mock ML outputs where possible

---

## What NOT to Do

- No monolithic files
- No hidden global state
- No magic thresholds without comments
- No UI logic mixed with ML logic

---

## Claude Instructions

When generating code:
- Default to **best practices**
- Explain tradeoffs briefly when relevant
- Avoid overengineering
- Ask before introducing new dependencies
