#!/usr/bin/env python3
"""
Equirectangular panorama -> Stellarium HiPS landscape tiles.

Usage:
    pip install healpy pillow numpy
    python pano2hips.py pano.jpg landscapes/mylandscape --order 2 --rotate 0

The output directory will contain:
    properties
    Norder0/Dir0/Npix*.webp   (12 tiles, lowest detail)
    Norder1/Dir0/Npix*.webp   (48 tiles)
    Norder2/Dir0/Npix*.webp   (192 tiles, highest detail at order 2)

In app.js point a data source at the output directory:
    stel.core.landscapes.addDataSource({ url: '/landscapes/mylandscape', key: 'mine' });
"""
import argparse
import os
import sys
import numpy as np
from PIL import Image
import healpy as hp


def deinterleave_morton(k, bits):
    """Decode Morton-ordered index k into (x, y) by deinterleaving bits."""
    x = np.zeros_like(k)
    y = np.zeros_like(k)
    for b in range(bits):
        x |= ((k >> (2 * b)) & 1) << b
        y |= ((k >> (2 * b + 1)) & 1) << b
    return x, y


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pano')
    ap.add_argument('out')
    ap.add_argument('--order', type=int, default=2, help='Max HiPS order (0..N).')
    ap.add_argument('--tile-width', type=int, default=512, help='Tile size, must be power of 2.')
    ap.add_argument('--rotate', type=float, default=0.0, help='Azimuth rotation in degrees.')
    ap.add_argument('--title', default='Custom landscape')
    ap.add_argument('--quality', type=int, default=90)
    args = ap.parse_args()

    tw = args.tile_width
    extra = int(np.log2(tw))
    if (1 << extra) != tw:
        sys.exit('--tile-width must be a power of 2')

    print(f'Loading {args.pano}...')
    pano = np.array(Image.open(args.pano).convert('RGBA'))
    H, W = pano.shape[:2]
    print(f'  {W}x{H}')
    if abs(W / H - 2.0) > 0.05:
        print(f'  WARNING: image is not 2:1 (ratio {W/H:.2f}). Output will be stretched.')

    rot_rad = np.deg2rad(args.rotate)
    os.makedirs(args.out, exist_ok=True)

    for order in range(args.order + 1):
        nside = 1 << order
        npix = 12 * nside * nside
        sub_nside = nside << extra
        print(f'Order {order}: {npix} tiles, sub_nside={sub_nside}')

        for ipix in range(npix):
            base = ipix * (1 << (2 * extra))
            local = np.arange(tw * tw, dtype=np.int64)
            sub_pixs = base + local

            theta, phi = hp.pix2ang(sub_nside, sub_pixs, nest=True)
            phi = np.mod(-phi + rot_rad, 2 * np.pi)

            u = (phi / (2 * np.pi) * W).astype(np.int64) % W
            v = (theta / np.pi * H).astype(np.int64).clip(0, H - 1)

            samples = pano[v, u]

            x, y = deinterleave_morton(local, extra)
            tile = np.zeros((tw, tw, 4), dtype=np.uint8)
            tile[x, y] = samples

            dir_idx = (ipix // 10000) * 10000
            d = os.path.join(args.out, f'Norder{order}', f'Dir{dir_idx}')
            os.makedirs(d, exist_ok=True)
            Image.fromarray(tile).save(
                os.path.join(d, f'Npix{ipix}.webp'),
                'WEBP', quality=args.quality, method=4,
            )

    properties = (
        f'hips_order        = {args.order}\n'
        f'hips_order_min    = 0\n'
        f'hips_tile_width   = {tw}\n'
        f'hips_tile_format  = webp\n'
        f'dataproduct_type  = image\n'
        f'obs_title         = {args.title}\n'
        f'type              = landscape\n'
    )
    with open(os.path.join(args.out, 'properties'), 'w') as f:
        f.write(properties)
    print(f'Done -> {args.out}/')


if __name__ == '__main__':
    main()
