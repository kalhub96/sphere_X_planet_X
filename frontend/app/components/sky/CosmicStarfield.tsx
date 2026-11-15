'use client';

import React, { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  size: number;
  alpha: number;
  speed: number;
  color: string;
}

export default function CosmicStarfield({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const colors = [
      'rgba(243, 238, 224, ', // ivory
      'rgba(212, 175, 55, ',  // gold
      'rgba(230, 198, 92, ',  // gold soft
      'rgba(143, 188, 143, ', // sage green
      'rgba(120, 180, 240, ', // faint blue
    ];

    const starCount = Math.min(220, Math.floor((width * height) / 8000));
    const stars: Star[] = Array.from({ length: starCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.7 + 0.2,
      speed: Math.random() * 0.02 + 0.005,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      stars.forEach((s) => {
        s.x = Math.random() * width;
        s.y = Math.random() * height;
      });
    };

    window.addEventListener('resize', handleResize);

    let tick = 0;
    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Deep celestial glow background
      const grad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.4,
        width * 0.05,
        width * 0.5,
        height * 0.5,
        width * 0.75
      );
      grad.addColorStop(0, 'rgba(212, 175, 55, 0.035)');
      grad.addColorStop(0.5, 'rgba(16, 22, 36, 0.25)');
      grad.addColorStop(1, 'rgba(10, 11, 15, 0.85)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Twinkling stars
      tick += 1;
      stars.forEach((s) => {
        const twinkle = Math.sin(tick * s.speed + s.x) * 0.3 + 0.7;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `${s.color}${s.alpha * twinkle})`;
        ctx.fill();
      });

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return <canvas ref={canvasRef} className={`block ${className}`} />;
}
