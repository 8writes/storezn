"use client";
import { useEffect, useRef } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  BarController,
  LineController,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  BarController,
  LineController,
  Title,
  Tooltip,
  Legend,
);

// Thin wrapper around plain chart.js (already a dependency, chart.js itself
// was never actually wired up anywhere before this). Deliberately not using
// react-chartjs-2, that'd be a second charting dependency doing the same
// job as this file.
export function Chart({ type, data, options, height = 240 }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const dataKey = JSON.stringify(data);

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current = new ChartJS(canvasRef.current, {
      type,
      data,
      options: { responsive: true, maintainAspectRatio: false, ...options },
    });
    return () => chartRef.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, dataKey]);

  return (
    <div style={{ height }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
