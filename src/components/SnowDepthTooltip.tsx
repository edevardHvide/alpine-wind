interface SnowDepthTooltipProps {
  depthCm: number;
  lat: number;
  lng: number;
  screenX: number;
  screenY: number;
  onClose: () => void;
}

export default function SnowDepthTooltip({
  depthCm,
  lat,
  lng,
  screenX,
  screenY,
  onClose,
}: SnowDepthTooltipProps) {
  // Position tooltip near click, offset slightly so it doesn't cover the point
  const style = {
    left: `${screenX + 16}px`,
    top: `${screenY - 40}px`,
  };

  return (
    <div
      className="absolute z-30 bg-gray-900/95 text-white rounded-lg px-4 py-3 backdrop-blur-sm shadow-xl pointer-events-auto"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-3">
        <div>
          <p className="text-lg font-bold text-blue-300">
            {depthCm.toFixed(1)} cm
          </p>
          <p className="text-xs text-gray-400">
            Predicted snow depth
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {lat.toFixed(4)}°N, {lng.toFixed(4)}°E
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white text-sm ml-2"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
