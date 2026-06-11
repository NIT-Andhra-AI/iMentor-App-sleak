#!/usr/bin/env python3
"""
Start the Student AI server.
Usage:
    python start.py [--host 0.0.0.0] [--port 8000]

Environment variables:
    ADMIN_API_KEY   Secret key for /admin/* endpoints (default: change-me-in-production)
"""
import argparse
import sys
import os

# Ensure the server/ directory is on sys.path so `api` package resolves.
sys.path.insert(0, os.path.dirname(__file__))

import uvicorn


def main():
    parser = argparse.ArgumentParser(description="Student AI API server")
    parser.add_argument("--host", default="127.0.0.1",
                        help="Bind host (use 0.0.0.0 behind Caddy)")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reload", action="store_true",
                        help="Hot-reload on code changes (dev only)")
    args = parser.parse_args()

    print(f"Starting Student AI server on {args.host}:{args.port}")
    print(f"Dashboard:    http://{args.host}:{args.port}/dashboard/admin.html")
    print(f"Health check: http://{args.host}:{args.port}/health")
    print()

    uvicorn.run(
        "api.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info",
    )


if __name__ == "__main__":
    main()
