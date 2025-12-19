import { useState, useEffect, useRef } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Plus, Trash2, Play, Pause, Download, RefreshCw, Settings2, Upload, Image as ImageIcon, Check, Sparkles } from 'lucide-react';
import GIF from 'gif.js';
import { GoogleGenAI, Type } from "@google/genai";
// We will handle the worker import in the main component or a utility to avoid issues here yet
// import workerScript from 'gif.js/dist/gif.worker.js?raw'; 

export interface BlobConfig {
  id: string;
  color: string;
  radius: number;
  xPhase: number;
  yPhase: number;
  xSpeed: number; // integers for perfect looping
  ySpeed: number; // integers for perfect looping
  centerX: number;
  centerY: number;
  orbitX: number;
  orbitY: number;
}

export interface AnimationConfig {
  duration: number; // seconds
  fps: number;
  blur: number;
  width: number;
  height: number;
}

const DEFAULT_COLORS = ['#FFD1DC', '#E0BBE4', '#957DAD', '#D291BC', '#FEC8D8'];

const RESOLUTIONS = [
  { label: 'Draft (540p)', width: 960, height: 540 },
  { label: 'HD (720p)', width: 1280, height: 720 },
  { label: 'Full HD (1080p)', width: 1920, height: 1080 },
];

export default function GradientGenerator() {
  const [colors, setColors] = useState<string[]>(DEFAULT_COLORS);
  
  const PRESETS = [
    { name: 'Candy', colors: ['#FFD1DC', '#E0BBE4', '#957DAD', '#D291BC', '#FEC8D8'] },
    { name: 'Aurora', colors: ['#00d2ff', '#3a7bd5', '#ffffff', '#8CA6DB', '#B993D6'] },
    { name: 'Sunset', colors: ['#ff7e5f', '#feb47b', '#ff9966', '#ff5e62', '#ffffff'] },
    { name: 'Ocean', colors: ['#2193b0', '#6dd5ed', '#ffffff', '#cc2b5e', '#753a88'] }, // Wait, ocean shouldn't have red/purple usually, but let's fix
    { name: 'Midnight', colors: ['#232526', '#414345', '#0f2027', '#203a43', '#2c5364'] },
  ];

  // Fix Ocean preset
  PRESETS[3].colors = ['#2193b0', '#6dd5ed', '#ffffff', '#1cb5e0', '#000046'];

  const [blobs, setBlobs] = useState<BlobConfig[]>([]);
  const [isPlaying, setIsPlaying] = useState(true);
  const [config, setConfig] = useState<AnimationConfig>({
    duration: 5,
    fps: 24,
    blur: 80,
    width: 960, // Google Slides aspect ratio (16:9) - 960x540 is good for performance/quality balance
    height: 540,
    quality: 20,
    movementScale: 1.0,
    backgroundColor: '#ffffff',
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // AI State
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<number>();
  const startTimeRef = useRef<number>(Date.now());

  // Initialize blobs
  useEffect(() => {
    generateBlobs();
  }, []); // Run once on mount

  // Re-assign colors to blobs when colors change
  useEffect(() => {
    setBlobs(prev => prev.map((blob, i) => ({
      ...blob,
      color: colors[i % colors.length]
    })));
  }, [colors]);

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `
          You are a creative assistant for a gradient animation tool.
          The user wants to modify the animation based on this request: "${aiPrompt}"
          
          Current colors: ${JSON.stringify(colors)}
          
          Generate a JSON response with:
          1. "colors": Array of hex color strings (optional, if colors should change).
          2. "blobs": Array of BlobConfig objects (optional, if movement/shapes should change).
          
          BlobConfig schema:
          {
            color: string (hex),
            radius: number (0.1 to 0.8, relative to screen size),
            xPhase: number (0 to 2*PI),
            yPhase: number (0 to 2*PI),
            xSpeed: number (integer 1-3),
            ySpeed: number (integer 1-3),
            centerX: number (0.0 to 1.0, position on screen),
            centerY: number (0.0 to 1.0, position on screen),
            orbitX: number (0.0 to 0.5, orbit radius),
            orbitY: number (0.0 to 0.5, orbit radius)
          }

          Guidelines:
          - "Safe area for text" means keeping blobs away from the center or a specific side (reduce orbit, move centers).
          - "Calm" means lower speeds, similar colors.
          - "Energetic" means higher speeds, contrasting colors.
          - Return ONLY valid JSON.
        `,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              colors: { type: Type.ARRAY, items: { type: Type.STRING } },
              blobs: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    color: { type: Type.STRING },
                    radius: { type: Type.NUMBER },
                    xPhase: { type: Type.NUMBER },
                    yPhase: { type: Type.NUMBER },
                    xSpeed: { type: Type.INTEGER },
                    ySpeed: { type: Type.INTEGER },
                    centerX: { type: Type.NUMBER },
                    centerY: { type: Type.NUMBER },
                    orbitX: { type: Type.NUMBER },
                    orbitY: { type: Type.NUMBER },
                  }
                }
              }
            }
          }
        }
      });

      const result = JSON.parse(response.text || "{}");
      
      if (result.colors) {
        setColors(result.colors);
      }
      
      if (result.blobs) {
        // Add IDs and natural params to new blobs
        const newBlobs = result.blobs.map((b: any) => ({
          ...b,
          id: Math.random().toString(36).substr(2, 9),
          // Ensure natural params exist if AI doesn't provide them
          pulseSpeed: b.pulseSpeed || Math.ceil(Math.random() * 3),
          pulsePhase: b.pulsePhase || Math.random() * Math.PI * 2,
          xHarmonicSpeed: b.xHarmonicSpeed || (b.xSpeed || 1) + 1,
          yHarmonicSpeed: b.yHarmonicSpeed || (b.ySpeed || 1) + 1,
          harmonicAmount: b.harmonicAmount || 0.3,
        }));
        setBlobs(newBlobs);
      }

      setAiPrompt('');
    } catch (error) {
      console.error("AI Generation failed:", error);
      alert("Failed to generate with AI. Please try again.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const extractedColors = extractColors(img);
        if (extractedColors.length > 0) {
          setColors(extractedColors);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
    
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const extractColors = (img: HTMLImageElement): string[] => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];

    // Resize to small dimension for performance
    const size = 100;
    canvas.width = size;
    canvas.height = size;
    ctx.drawImage(img, 0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size).data;
    const colorCounts: Record<string, number> = {};

    // Sample pixels
    for (let i = 0; i < imageData.length; i += 4) {
      const r = imageData[i];
      const g = imageData[i + 1];
      const b = imageData[i + 2];
      const a = imageData[i + 3];

      if (a < 128) continue; // Skip transparent

      // Quantize to group similar colors (round to nearest 10)
      const q = 10;
      const qr = Math.round(r / q) * q;
      const qg = Math.round(g / q) * q;
      const qb = Math.round(b / q) * q;

      const key = `${qr},${qg},${qb}`;
      colorCounts[key] = (colorCounts[key] || 0) + 1;
    }

    // Convert to array and sort by frequency
    const sortedColors = Object.entries(colorCounts)
      .sort(([, countA], [, countB]) => countB - countA)
      .map(([key]) => {
        const [r, g, b] = key.split(',').map(Number);
        return { r, g, b, hex: `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}` };
      });

    // Select distinct colors
    const distinctColors: string[] = [];
    const minDistance = 50; // Minimum Euclidean distance between colors

    for (const color of sortedColors) {
      if (distinctColors.length >= 5) break;

      const isDistinct = distinctColors.every(existingHex => {
        const r2 = parseInt(existingHex.slice(1, 3), 16);
        const g2 = parseInt(existingHex.slice(3, 5), 16);
        const b2 = parseInt(existingHex.slice(5, 7), 16);
        
        const dist = Math.sqrt(
          Math.pow(color.r - r2, 2) + 
          Math.pow(color.g - g2, 2) + 
          Math.pow(color.b - b2, 2)
        );
        return dist > minDistance;
      });

      if (isDistinct) {
        distinctColors.push(color.hex);
      }
    }

    // If we didn't find enough distinct colors, fill with top remaining
    if (distinctColors.length < 3) {
       for (const color of sortedColors) {
         if (distinctColors.length >= 5) break;
         if (!distinctColors.includes(color.hex)) {
           distinctColors.push(color.hex);
         }
       }
    }

    return distinctColors;
  };

  const generateBlobs = () => {
    const newBlobs: BlobConfig[] = [];
    const count = 6; // Number of blobs
    
    for (let i = 0; i < count; i++) {
      newBlobs.push({
        id: Math.random().toString(36).substr(2, 9),
        color: colors[i % colors.length],
        radius: 0.3 + Math.random() * 0.3, // 30% to 60% of min dimension
        xPhase: Math.random() * Math.PI * 2,
        yPhase: Math.random() * Math.PI * 2,
        xSpeed: Math.ceil(Math.random() * 2), // 1 or 2 loops per duration
        ySpeed: Math.ceil(Math.random() * 2),
        centerX: 0.2 + Math.random() * 0.6, // 20% to 80% of screen
        centerY: 0.2 + Math.random() * 0.6,
        orbitX: 0.1 + Math.random() * 0.2, // Orbit radius
        orbitY: 0.1 + Math.random() * 0.2,
        // Natural movement defaults
        pulseSpeed: Math.ceil(Math.random() * 3),
        pulsePhase: Math.random() * Math.PI * 2,
        xHarmonicSpeed: Math.ceil(Math.random() * 3) + 1, // Higher freq than base
        yHarmonicSpeed: Math.ceil(Math.random() * 3) + 1,
        harmonicAmount: 0.2 + Math.random() * 0.3, // 20-50% influence
      });
    }
    setBlobs(newBlobs);
  };

  const drawFrame = (ctx: CanvasRenderingContext2D, time: number) => {
    const { width, height, blur, backgroundColor } = config;
    const minDim = Math.min(width, height);
    
    // Clear canvas
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
    
    // Apply blur
    ctx.filter = `blur(${blur}px)`;

    // Draw blobs
    blobs.forEach(blob => {
      // Calculate position based on time (0 to 1)
      const t = time; // 0 to 1
      
      // Apply movement scale to orbit radius
      const currentOrbitX = blob.orbitX * config.movementScale;
      const currentOrbitY = blob.orbitY * config.movementScale;

      // Primary wave
      const angleX = 2 * Math.PI * t * blob.xSpeed + blob.xPhase;
      const angleY = 2 * Math.PI * t * blob.ySpeed + blob.yPhase;

      // Secondary wave (harmonic) for more organic shape
      // Use defaults if harmonic props missing (for backward compat with AI generated blobs)
      const hSpeedX = blob.xHarmonicSpeed || (blob.xSpeed + 1);
      const hSpeedY = blob.yHarmonicSpeed || (blob.ySpeed + 1);
      const hAmount = blob.harmonicAmount || 0.2;
      
      const angleX2 = 2 * Math.PI * t * hSpeedX + blob.xPhase;
      const angleY2 = 2 * Math.PI * t * hSpeedY + blob.yPhase;

      // Calculate position with compound waves
      const rawX = blob.centerX + 
                   currentOrbitX * Math.cos(angleX) + 
                   (currentOrbitX * hAmount) * Math.cos(angleX2);
                   
      const rawY = blob.centerY + 
                   currentOrbitY * Math.sin(angleY) + 
                   (currentOrbitY * hAmount) * Math.sin(angleY2);

      const x = rawX * width;
      const y = rawY * height;
      
      // Pulse radius
      const pSpeed = blob.pulseSpeed || 2;
      const pPhase = blob.pulsePhase || 0;
      const pulse = 1 + 0.15 * Math.sin(2 * Math.PI * t * pSpeed + pPhase);
      
      // Scale radius
      const r = blob.radius * minDim * pulse;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = blob.color;
      ctx.fill();
    });

    ctx.filter = 'none';
  };

  const animate = () => {
    if (!canvasRef.current || !isPlaying) return;
    
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const now = Date.now();
    const elapsed = (now - startTimeRef.current) / 1000;
    const progress = (elapsed % config.duration) / config.duration;

    drawFrame(ctx, progress);
    
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (isPlaying) {
      startTimeRef.current = Date.now(); // Reset start time to sync? 
      // Actually for smooth resume we might need to adjust, but for now simple start/stop
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, blobs, config]);

  const handleExport = async () => {
    if (!canvasRef.current) return;
    setIsExporting(true);
    setExportProgress(0);
    setIsPlaying(false); // Stop preview

    try {
      // Dynamic import of worker script
      const workerModule = await import('gif.js/dist/gif.worker.js?raw');
      const workerBlob = new Blob([workerModule.default], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(workerBlob);

      const gif = new GIF({
        workers: 2,
        quality: config.quality,
        workerScript: workerUrl,
        width: config.width,
        height: config.height,
      });

      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) throw new Error("No context");

      const totalFrames = config.duration * config.fps;
      
      // Render frames
      for (let i = 0; i < totalFrames; i++) {
        const progress = i / totalFrames;
        drawFrame(ctx, progress);
        gif.addFrame(canvasRef.current, { copy: true, delay: 1000 / config.fps });
        setExportProgress(Math.round((i / totalFrames) * 50)); // First 50% is rendering
        
        // Yield to UI thread occasionally
        if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
      }

      gif.on('progress', (p) => {
        setExportProgress(50 + Math.round(p * 50)); // Last 50% is encoding
      });

      gif.on('finished', (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'gradient-loop.gif';
        a.click();
        setIsExporting(false);
        setIsPlaying(true);
        URL.revokeObjectURL(workerUrl);
      });

      gif.render();

    } catch (err) {
      console.error(err);
      setIsExporting(false);
      alert('Failed to export GIF');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#f8f9fa] text-[#202124] font-sans selection:bg-blue-100">
      {/* Header */}
      <header className="bg-white border-b border-[#dadce0] px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-[#4285f4] to-[#34a853] rounded-xl flex items-center justify-center text-white shadow-sm">
             <RefreshCw size={20} className="animate-spin-slow" style={{ animationDuration: '10s' }} />
          </div>
          <div>
            <h1 className="text-xl font-medium text-[#202124] leading-tight">
              Gradient Loop
            </h1>
            <p className="text-xs text-[#5f6368]">Internal Tools</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleExport}
            disabled={isExporting}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-medium transition-all shadow-sm ${
              isExporting 
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-[#1a73e8] text-white hover:bg-[#1557b0] hover:shadow-md active:shadow-sm'
            }`}
          >
            {isExporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Exporting {exportProgress}%</span>
              </>
            ) : (
              <>
                <Download size={18} />
                <span>Export GIF</span>
              </>
            )}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Controls */}
        <aside className="w-80 bg-white border-r border-[#dadce0] overflow-y-auto flex flex-col z-10">
          <div className="p-6 space-y-8">
            
            {/* AI Assistant */}
          <section>
            <h2 className="text-xs font-bold text-[#5f6368] uppercase tracking-wider mb-4">AI Assistant</h2>
            <div className="relative">
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Describe your desired vibe (e.g., 'Calm ocean waves with space for text in the center')"
                className="w-full min-h-[100px] p-3 text-sm border border-[#dadce0] rounded-lg focus:outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8] resize-none bg-white text-[#3c4043]"
              />
              <button
                onClick={handleAiGenerate}
                disabled={isAiLoading || !aiPrompt.trim()}
                className="absolute bottom-2 right-2 p-2 bg-[#1a73e8] text-white rounded-full hover:bg-[#1557b0] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {isAiLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
              </button>
            </div>
          </section>

          <hr className="border-[#dadce0]" />

          {/* Colors */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-bold text-[#5f6368] uppercase tracking-wider">Palette</h2>
                <div className="flex gap-2">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 hover:bg-[#f1f3f4] rounded-full text-[#5f6368] transition-colors"
                    title="Import from Image"
                  >
                    <ImageIcon size={18} />
                  </button>
                  <button 
                    onClick={() => setColors([...colors, '#ffffff'])}
                    className="p-2 hover:bg-[#f1f3f4] rounded-full text-[#5f6368] transition-colors"
                    title="Add Color"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  accept="image/*"
                  className="hidden"
                />
              </div>

              {/* Background Color */}
              <div className="mb-4">
                <label className="text-xs font-medium text-[#5f6368] mb-2 block">Background</label>
                <div className="flex items-center gap-3 group">
                  <div className="relative">
                    <div 
                      className="w-10 h-10 rounded-full border border-[#dadce0] shadow-sm cursor-pointer transition-transform hover:scale-105"
                      style={{ backgroundColor: config.backgroundColor }}
                    />
                    <input 
                      type="color" 
                      value={config.backgroundColor}
                      onChange={(e) => setConfig({ ...config, backgroundColor: e.target.value })}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </div>
                  <input 
                    type="text" 
                    value={config.backgroundColor}
                    onChange={(e) => setConfig({ ...config, backgroundColor: e.target.value })}
                    className="flex-1 text-sm font-mono border border-[#dadce0] rounded-md px-3 py-2 focus:outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8] uppercase text-[#3c4043]"
                  />
                </div>
              </div>

              {/* Presets */}
              <div className="flex flex-wrap gap-2 mb-6">
                {PRESETS.map(preset => (
                  <button
                    key={preset.name}
                    onClick={() => setColors(preset.colors)}
                    className="px-3 py-1.5 text-xs font-medium bg-white border border-[#dadce0] hover:bg-[#f1f3f4] hover:border-[#dadce0] rounded-full transition-colors text-[#3c4043]"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {colors.map((color, index) => (
                  <div key={index} className="flex items-center gap-3 group">
                    <div className="relative">
                      <div 
                        className="w-10 h-10 rounded-full border border-[#dadce0] shadow-sm cursor-pointer transition-transform hover:scale-105"
                        style={{ backgroundColor: color }}
                      />
                      <input 
                        type="color" 
                        value={color}
                        onChange={(e) => {
                          const newColors = [...colors];
                          newColors[index] = e.target.value;
                          setColors(newColors);
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                    </div>
                    <input 
                      type="text" 
                      value={color}
                      onChange={(e) => {
                        const newColors = [...colors];
                        newColors[index] = e.target.value;
                        setColors(newColors);
                      }}
                      className="flex-1 text-sm font-mono border border-[#dadce0] rounded-md px-3 py-2 focus:outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8] uppercase text-[#3c4043]"
                    />
                    {colors.length > 2 && (
                      <button 
                        onClick={() => setColors(colors.filter((_, i) => i !== index))}
                        className="text-[#9aa0a6] hover:text-[#d93025] opacity-0 group-hover:opacity-100 transition-all p-2 hover:bg-[#fce8e6] rounded-full"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <hr className="border-[#dadce0]" />

            {/* Settings */}
            <section>
              <h2 className="text-xs font-bold text-[#5f6368] uppercase tracking-wider mb-6">Configuration</h2>
              
              <div className="space-y-8">
                {/* Resolution Selector */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-[#3c4043]">Output Resolution</label>
                  <div className="grid grid-cols-1 gap-2">
                    {RESOLUTIONS.map((res) => (
                      <button
                        key={res.label}
                        onClick={() => setConfig({ ...config, width: res.width, height: res.height })}
                        className={`flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-all ${
                          config.width === res.width
                            ? 'border-[#1a73e8] bg-[#e8f0fe] text-[#1a73e8]'
                            : 'border-[#dadce0] bg-white text-[#3c4043] hover:bg-[#f8f9fa]'
                        }`}
                      >
                        <span>{res.label}</span>
                        {config.width === res.width && <Check size={16} />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <label className="text-[#3c4043] font-medium">Loop Duration</label>
                    <span className="text-[#5f6368] bg-[#f1f3f4] px-2 py-0.5 rounded text-xs">{config.duration}s</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="10" 
                    step="1"
                    value={config.duration}
                    onChange={(e) => setConfig({...config, duration: parseInt(e.target.value)})}
                    className="w-full h-1.5 bg-[#dadce0] rounded-lg appearance-none cursor-pointer accent-[#1a73e8]"
                  />
                  <p className="text-xs text-[#5f6368]">Shorter = Faster animation</p>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <label className="text-[#3c4043] font-medium">Movement Range</label>
                    <span className="text-[#5f6368] bg-[#f1f3f4] px-2 py-0.5 rounded text-xs">{Math.round(config.movementScale * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="200" 
                    step="10"
                    value={config.movementScale * 100}
                    onChange={(e) => setConfig({...config, movementScale: parseInt(e.target.value) / 100})}
                    className="w-full h-1.5 bg-[#dadce0] rounded-lg appearance-none cursor-pointer accent-[#1a73e8]"
                  />
                  <p className="text-xs text-[#5f6368]">Lower this for short loops to keep it calm</p>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <label className="text-[#3c4043] font-medium">Blur Strength</label>
                    <span className="text-[#5f6368] bg-[#f1f3f4] px-2 py-0.5 rounded text-xs">{config.blur}px</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="200" 
                    step="10"
                    value={config.blur}
                    onChange={(e) => setConfig({...config, blur: parseInt(e.target.value)})}
                    className="w-full h-1.5 bg-[#dadce0] rounded-lg appearance-none cursor-pointer accent-[#1a73e8]"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <label className="text-[#3c4043] font-medium">Frame Rate</label>
                    <span className="text-[#5f6368] bg-[#f1f3f4] px-2 py-0.5 rounded text-xs">{config.fps} fps</span>
                  </div>
                  <input 
                    type="range" 
                    min="12" 
                    max="30" 
                    step="1"
                    value={config.fps}
                    onChange={(e) => setConfig({...config, fps: parseInt(e.target.value)})}
                    className="w-full h-1.5 bg-[#dadce0] rounded-lg appearance-none cursor-pointer accent-[#1a73e8]"
                  />
                  <p className="text-xs text-[#5f6368]">Lower FPS = Smaller file size</p>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <label className="text-[#3c4043] font-medium">GIF Quality</label>
                    <span className="text-[#5f6368] bg-[#f1f3f4] px-2 py-0.5 rounded text-xs">
                      {config.quality <= 10 ? 'Best' : config.quality <= 20 ? 'Good' : 'Draft'}
                    </span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="50" // Increased max to allow for more compression
                    step="1"
                    value={51 - config.quality}
                    onChange={(e) => setConfig({...config, quality: 51 - parseInt(e.target.value)})}
                    className="w-full h-1.5 bg-[#dadce0] rounded-lg appearance-none cursor-pointer accent-[#1a73e8]"
                  />
                  <p className="text-xs text-[#5f6368]">Higher quality = Larger file size</p>
                </div>

                <button 
                  onClick={generateBlobs}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border border-[#dadce0] rounded-full text-sm font-medium text-[#1a73e8] hover:bg-[#f8f9fa] hover:border-[#d2e3fc] hover:bg-[#e8f0fe] transition-all"
                >
                  <RefreshCw size={16} />
                  Regenerate Pattern
                </button>
              </div>
            </section>
          </div>
          
          <div className="mt-auto pt-6 border-t border-gray-100 text-xs text-gray-400 p-6">
            <p>Export size: {config.width}x{config.height}px</p>
            <p>Frame rate: {config.fps} fps</p>
          </div>
        </aside>

        {/* Main Preview Area */}
        <main className="flex-1 bg-[#f8f9fa] flex items-center justify-center p-12 relative overflow-hidden">
          
          <div className="relative shadow-[0_8px_30px_rgba(0,0,0,0.12)] rounded-2xl overflow-hidden bg-white ring-1 ring-black/5">
            <canvas 
              ref={canvasRef}
              width={config.width}
              height={config.height}
              className="max-w-full max-h-[80vh] w-auto h-auto block"
              style={{ aspectRatio: `${config.width}/${config.height}` }}
            />
            
            {/* Overlay Controls */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/90 backdrop-blur-md px-6 py-3 rounded-full shadow-lg border border-white/50 opacity-0 hover:opacity-100 transition-opacity duration-300">
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-2 hover:bg-[#f1f3f4] rounded-full transition-colors text-[#3c4043]"
              >
                {isPlaying ? <Pause size={24} className="fill-current" /> : <Play size={24} className="fill-current" />}
              </button>
            </div>
          </div>
          
          <div className="absolute bottom-4 right-6 text-xs text-[#9aa0a6] font-medium">
            Previewing: {config.width}x{config.height}px @ {config.fps}fps
          </div>
        </main>
      </div>
    </div>
  );
}
