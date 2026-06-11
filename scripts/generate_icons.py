#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Automated icon/logo generation from a single source image.
Generates all required sizes and formats for:
  - Tauri app icons (src-tauri/icons/)
  - Frontend logos (frontend/src/assets/)
  - Windows installer icon (.ico)
"""

import os
import sys
from pathlib import Path

# Try PIL first; fallback to Pillow if not available
try:
    from PIL import Image
except ImportError:
    try:
        import Image
    except ImportError:
        print("ERROR: Pillow/PIL not found. Install with: pip install Pillow", file=sys.stderr)
        sys.exit(1)


def ensure_dir(path):
    """Create directory if it doesn't exist."""
    path.mkdir(parents=True, exist_ok=True)


def generate_icons(source_image_path):
    """
    Generate all required icon/logo files from source image.
    
    Args:
        source_image_path: Path to source image (jpg/png)
    
    Returns:
        tuple: (success: bool, message: str)
    """
    source_path = Path(source_image_path)
    
    # Verify source exists
    if not source_path.exists():
        return False, f"Source image not found: {source_path}"
    
    # Load source image
    try:
        img = Image.open(source_path)
        if img.mode == 'RGBA':
            # Keep RGBA for transparency
            pass
        else:
            # Convert to RGB for formats that need it
            if img.mode != 'RGB':
                img = img.convert('RGB')
    except Exception as e:
        return False, f"Failed to load image: {e}"
    
    # Define target locations and specs
    targets = [
        # (output_path, size, format, quality, description)
        ('src-tauri/icons/32x32.png', (32, 32), 'PNG', None, 'Tauri 32x32 icon'),
        ('src-tauri/icons/128x128.png', (128, 128), 'PNG', None, 'Tauri 128x128 icon'),
        ('src-tauri/icons/icon.ico', (256, 256), 'ICO', None, 'Windows app icon'),
        ('frontend/src/assets/logo.png', (512, 512), 'PNG', None, 'Frontend PNG logo'),
        ('frontend/src/assets/logo.jpg', (512, 512), 'JPEG', 95, 'Frontend JPEG logo'),
    ]
    
    project_root = Path(__file__).parent.parent
    results = []
    
    for rel_path, size, fmt, quality, desc in targets:
        try:
            output_path = project_root / rel_path
            ensure_dir(output_path.parent)
            
            # Resize image
            resized = img.resize(size, Image.Resampling.LANCZOS)
            
            # Convert color mode if needed
            if fmt == 'JPEG':
                if resized.mode in ('RGBA', 'LA', 'P'):
                    # JPEG doesn't support transparency
                    background = Image.new('RGB', size, (255, 255, 255))
                    background.paste(resized, mask=resized.split()[-1] if resized.mode in ('RGBA', 'LA') else None)
                    resized = background
                elif resized.mode != 'RGB':
                    resized = resized.convert('RGB')
            elif fmt == 'ICO':
                if resized.mode != 'RGB':
                    resized = resized.convert('RGB')
            
            # Save with appropriate options
            if fmt == 'JPEG' and quality:
                resized.save(output_path, fmt, quality=quality, optimize=True)
            else:
                resized.save(output_path, fmt)
            
            results.append((True, f"{desc}: {output_path.relative_to(project_root)}"))
            
        except Exception as e:
            results.append((False, f"{desc}: {e}"))
    
    # Print results
    success_count = sum(1 for s, _ in results if s)
    total_count = len(results)
    
    print(f"\n[icon-gen] Generated {success_count}/{total_count} icon files")
    for success, msg in results:
        status = "[OK]" if success else "[FAIL]"
        print(f"[icon-gen] {status} {msg}")
    
    all_success = all(s for s, _ in results)
    return all_success, f"{success_count}/{total_count} icons generated"


if __name__ == '__main__':
    # Default to logo_test.jpg in project root
    source = Path(__file__).parent.parent / 'logo_test.jpg'

    if len(sys.argv) > 1:
        source = Path(sys.argv[1])

    if not source.exists():
        # Icons already generated — skip silently.
        print(f"[icon-gen] Source image not found: {source} — skipping (icons already present)")
        sys.exit(0)

    success, msg = generate_icons(source)
    print(f"[icon-gen] {msg}")
    sys.exit(0 if success else 1)
