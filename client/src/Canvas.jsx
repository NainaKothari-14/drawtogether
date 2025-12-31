import React, { useRef, useEffect, useState } from "react";
import { Pencil, Eraser, Circle, Square, Minus, Undo2, Redo2, Trash2, Download, Users, Paintbrush, Play, Pause, User, Link2, Clock, AlertCircle } from "lucide-react";
import io from "socket.io-client";

// Connect to your backend server
const socket = io("http://localhost:5000", {
  transports: ["websocket", "polling"]
});

const Canvas = () => {
  const canvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const replayRef = useRef({ isReplaying: false });
  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState("#000000");
  const [fillColor, setFillColor] = useState("transparent");
  const [brushSize, setBrushSize] = useState(3);
  const [tool, setTool] = useState("brush");
  const [brushType, setBrushType] = useState("normal");
  const [history, setHistory] = useState([]);
  const [historyStep, setHistoryStep] = useState(0);
  const [username, setUsername] = useState("");
  const [showNamePrompt, setShowNamePrompt] = useState(true);
  const [boardId, setBoardId] = useState("");
  const [actionLog, setActionLog] = useState([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [userCount, setUserCount] = useState(1);
  const [activeUsers, setActiveUsers] = useState([]);
  const [userCursors, setUserCursors] = useState({});
  const [showJoinOption, setShowJoinOption] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  const defaultColors = ["#000000", "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF", "#FFA500", "#800080", "#FFFFFF"];

  function generateBoardId() {
    return Math.random().toString(36).substring(2, 9);
  }

  // Initialize board from URL
  useEffect(() => {
    const path = window.location.pathname;
    const urlBoardId = path.split('/board/')[1];
    
    if (urlBoardId) {
      setBoardId(urlBoardId);
    }
  }, []);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    
    if (!canvas || !previewCanvas) return;
    
    const ctx = canvas.getContext("2d");

    canvas.width = window.innerWidth - 100;
    canvas.height = window.innerHeight - 80;
    previewCanvas.width = canvas.width;
    previewCanvas.height = canvas.height;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    setHistory([canvas.toDataURL()]);
    setHistoryStep(0);

    const handleResize = () => {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = window.innerWidth - 100;
      canvas.height = window.innerHeight - 80;
      previewCanvas.width = canvas.width;
      previewCanvas.height = canvas.height;
      ctx.putImageData(imageData, 0, 0);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Socket.io event listeners
  useEffect(() => {
    if (!boardId || !username) return;

    // Join the board
    socket.emit("joinBoard", { boardId, username });

    // Load existing board state
    socket.on("boardState", ({ actions, canvasData }) => {
      if (canvasData && canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
          saveToHistory();
        };
        img.src = canvasData;
      }
    });

    // Listen for drawing from others
    socket.on("drawing", ({ x0, y0, x1, y1, color, size, brushType, username: user }) => {
      const ctx = canvasRef.current.getContext("2d");
      drawLine(x0, y0, x1, y1, color, size, brushType, ctx);
      addActionLog(user, "drew a line");
    });

    // Listen for shapes from others
    socket.on("shape", ({ type, x0, y0, x1, y1, color, fillColor, size, username: user }) => {
      const ctx = canvasRef.current.getContext("2d");
      drawShape(type, x0, y0, x1, y1, color, fillColor, size, ctx, false);
      addActionLog(user, `drew a ${type}`);
    });

    // Listen for eraser from others
    socket.on("erase", ({ x, y, size, username: user }) => {
      const ctx = canvasRef.current.getContext("2d");
      erase(x, y, size, ctx);
      addActionLog(user, "erased");
    });

    // Listen for fill from others
    socket.on("fill", ({ x, y, fillColor, username: user }) => {
      const ctx = canvasRef.current.getContext("2d");
      floodFill(x, y, fillColor, ctx);
      addActionLog(user, "filled an area");
    });

    // Listen for clear canvas
    socket.on("clearCanvas", ({ username: user }) => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      saveToHistory();
      addActionLog(user, "cleared the canvas");
    });

    // Listen for user cursors
    socket.on("userCursors", (cursors) => {
      setUserCursors(cursors);
    });

    // Listen for user count
    socket.on("userCount", (count) => {
      setUserCount(count);
    });

    // Listen for active users
    socket.on("activeUsers", (users) => {
      setActiveUsers(users);
    });

    // Listen for user joined
    socket.on("userJoined", ({ username: user }) => {
      addActionLog(user, "joined the board");
    });

    // Listen for user left
    socket.on("userLeft", ({ username: user }) => {
      addActionLog(user, "left the board");
    });

    return () => {
      socket.off("boardState");
      socket.off("drawing");
      socket.off("shape");
      socket.off("erase");
      socket.off("fill");
      socket.off("clearCanvas");
      socket.off("userCursors");
      socket.off("userCount");
      socket.off("activeUsers");
      socket.off("userJoined");
      socket.off("userLeft");
    };
  }, [boardId, username]);

  const addActionLog = (user, action) => {
    const timestamp = new Date().toLocaleTimeString();
    setActionLog(prev => [...prev, { username: user, action, timestamp }].slice(-50));
  };

  const saveToHistory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(canvas.toDataURL());
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);

    // Save to server periodically
    if (newHistory.length % 5 === 0) {
      socket.emit("saveBoard", { boardId, canvasData: canvas.toDataURL() });
    }
  };

  const undo = () => {
    if (historyStep > 0) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.src = history[historyStep - 1];
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
      setHistoryStep(historyStep - 1);
    }
  };

  const redo = () => {
    if (historyStep < history.length - 1) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.src = history[historyStep + 1];
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
      setHistoryStep(historyStep + 1);
    }
  };

  const drawLine = (x0, y0, x1, y1, color, size, brushType, ctx) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (brushType === "blur") {
      ctx.filter = "blur(2px)";
      ctx.globalAlpha = 0.6;
    } else if (brushType === "spray") {
      const density = 20;
      for (let i = 0; i < density; i++) {
        const offsetX = (Math.random() - 0.5) * size * 2;
        const offsetY = (Math.random() - 0.5) * size * 2;
        ctx.fillStyle = color;
        ctx.globalAlpha = Math.random() * 0.5 + 0.3;
        ctx.beginPath();
        ctx.arc(x1 + offsetX, y1 + offsetY, 1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    } else if (brushType === "marker") {
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = size * 1.5;
    } else if (brushType === "glow") {
      ctx.shadowBlur = size * 2;
      ctx.shadowColor = color;
    }

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.closePath();
    ctx.restore();
  };

  const drawShape = (type, x0, y0, x1, y1, color, fillColor, size, ctx, isPreview = false) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (isPreview) {
      ctx.setLineDash([5, 5]);
      ctx.globalAlpha = 0.5;
    }

    const width = x1 - x0;
    const height = y1 - y0;

    if (type === "rectangle") {
      ctx.beginPath();
      ctx.rect(x0, y0, width, height);
      if (fillColor && fillColor !== "transparent") {
        ctx.fillStyle = fillColor;
        ctx.fill();
      }
      ctx.stroke();
      ctx.closePath();
    } else if (type === "circle") {
      const radius = Math.sqrt(width * width + height * height);
      ctx.beginPath();
      ctx.arc(x0, y0, radius, 0, 2 * Math.PI);
      if (fillColor && fillColor !== "transparent") {
        ctx.fillStyle = fillColor;
        ctx.fill();
      }
      ctx.stroke();
      ctx.closePath();
    } else if (type === "line") {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.closePath();
    }

    ctx.restore();
  };

  const erase = (x, y, size, ctx) => {
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const floodFill = (startX, startY, fillColor, ctx) => {
    const canvas = canvasRef.current;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    const targetColor = getPixelColor(pixels, startX, startY, canvas.width);
    
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.fillStyle = fillColor;
    tempCtx.fillRect(0, 0, 1, 1);
    const tempData = tempCtx.getImageData(0, 0, 1, 1).data;
    const fillColorRGB = { r: tempData[0], g: tempData[1], b: tempData[2], a: 255 };

    if (colorsMatch(targetColor, fillColorRGB)) return;

    const pixelsToCheck = [[startX, startY]];
    const checkedPixels = new Set();

    while (pixelsToCheck.length > 0) {
      const [x, y] = pixelsToCheck.pop();
      const key = `${x},${y}`;

      if (checkedPixels.has(key)) continue;
      if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) continue;

      const currentColor = getPixelColor(pixels, x, y, canvas.width);
      
      if (colorsMatch(currentColor, targetColor)) {
        setPixelColor(pixels, x, y, canvas.width, fillColorRGB);
        checkedPixels.add(key);

        pixelsToCheck.push([x + 1, y]);
        pixelsToCheck.push([x - 1, y]);
        pixelsToCheck.push([x, y + 1]);
        pixelsToCheck.push([x, y - 1]);
      }
    }

    ctx.putImageData(imageData, 0, 0);
  };

  const getPixelColor = (pixels, x, y, width) => {
    const index = (y * width + x) * 4;
    return {
      r: pixels[index],
      g: pixels[index + 1],
      b: pixels[index + 2],
      a: pixels[index + 3]
    };
  };

  const setPixelColor = (pixels, x, y, width, color) => {
    const index = (y * width + x) * 4;
    pixels[index] = color.r;
    pixels[index + 1] = color.g;
    pixels[index + 2] = color.b;
    pixels[index + 3] = color.a;
  };

  const colorsMatch = (color1, color2, tolerance = 10) => {
    return (
      Math.abs(color1.r - color2.r) <= tolerance &&
      Math.abs(color1.g - color2.g) <= tolerance &&
      Math.abs(color1.b - color2.b) <= tolerance &&
      Math.abs(color1.a - color2.a) <= tolerance
    );
  };

  const handleMouseDown = (e) => {
    const { offsetX, offsetY } = e.nativeEvent;
    const ctx = canvasRef.current.getContext("2d");

    if (tool === "fill") {
      floodFill(Math.floor(offsetX), Math.floor(offsetY), fillColor, ctx);
      saveToHistory();
      socket.emit("fill", { x: Math.floor(offsetX), y: Math.floor(offsetY), fillColor, boardId, username });
      addActionLog(username, "filled an area");
      return;
    }

    setDrawing(true);
    canvasRef.current.startX = offsetX;
    canvasRef.current.startY = offsetY;
    canvasRef.current.lastX = offsetX;
    canvasRef.current.lastY = offsetY;
  };

  const handleMouseMove = (e) => {
    const { offsetX, offsetY } = e.nativeEvent;
    const ctx = canvasRef.current.getContext("2d");
    const previewCtx = previewCanvasRef.current.getContext("2d");

    // Update cursor position
    socket.emit("cursorMove", { x: offsetX, y: offsetY, boardId, username });

    if (!drawing) return;

    previewCtx.clearRect(0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);

    if (tool === "brush") {
      drawLine(
        canvasRef.current.lastX,
        canvasRef.current.lastY,
        offsetX,
        offsetY,
        color,
        brushSize,
        brushType,
        ctx
      );
      socket.emit("drawing", {
        x0: canvasRef.current.lastX,
        y0: canvasRef.current.lastY,
        x1: offsetX,
        y1: offsetY,
        color,
        size: brushSize,
        brushType,
        boardId,
        username
      });
      canvasRef.current.lastX = offsetX;
      canvasRef.current.lastY = offsetY;
    } else if (tool === "eraser") {
      erase(offsetX, offsetY, brushSize * 3, ctx);
      socket.emit("erase", { x: offsetX, y: offsetY, size: brushSize * 3, boardId, username });
      canvasRef.current.lastX = offsetX;
      canvasRef.current.lastY = offsetY;
    } else if (tool === "rectangle" || tool === "circle" || tool === "line") {
      drawShape(
        tool,
        canvasRef.current.startX,
        canvasRef.current.startY,
        offsetX,
        offsetY,
        color,
        fillColor,
        brushSize,
        previewCtx,
        true
      );
    }
  };

  const handleMouseUp = (e) => {
    if (!drawing) return;
    
    const { offsetX, offsetY } = e.nativeEvent;
    const ctx = canvasRef.current.getContext("2d");
    const previewCtx = previewCanvasRef.current.getContext("2d");

    previewCtx.clearRect(0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);

    if (tool === "rectangle" || tool === "circle" || tool === "line") {
      drawShape(
        tool,
        canvasRef.current.startX,
        canvasRef.current.startY,
        offsetX,
        offsetY,
        color,
        fillColor,
        brushSize,
        ctx
      );
      socket.emit("shape", {
        type: tool,
        x0: canvasRef.current.startX,
        y0: canvasRef.current.startY,
        x1: offsetX,
        y1: offsetY,
        color,
        fillColor,
        size: brushSize,
        boardId,
        username
      });
      addActionLog(username, `drew a ${tool}`);
    } else if (tool === "brush") {
      addActionLog(username, "drew a line");
    } else if (tool === "eraser") {
      addActionLog(username, "erased");
    }

    saveToHistory();
    setDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveToHistory();
    socket.emit("clearCanvas", { boardId, username });
    addActionLog(username, "cleared the canvas");
  };

  const downloadCanvas = () => {
    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = `board-${boardId}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  const copyBoardLink = () => {
    const link = `${window.location.origin}/board/${boardId}`;
    navigator.clipboard.writeText(link).then(() => {
      alert(`✅ Board link copied!\n\nBoard Code: ${boardId}\n\nShare this link or code with friends to collaborate together!`);
    });
  };

  const replayDrawing = async () => {
    if (replayRef.current.isReplaying) {
      replayRef.current.isReplaying = false;
      setIsReplaying(false);
      return;
    }

    replayRef.current.isReplaying = true;
    setIsReplaying(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 1; i < history.length; i++) {
      if (!replayRef.current.isReplaying) break;
      
      await new Promise(resolve => setTimeout(resolve, 500));
      const img = new Image();
      img.src = history[i];
      await new Promise(resolve => {
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          resolve();
        };
      });
    }

    replayRef.current.isReplaying = false;
    setIsReplaying(false);
  };

  const handleCreateBoard = () => {
    if (username.trim()) {
      const newBoardId = generateBoardId();
      setBoardId(newBoardId);
      window.history.pushState({}, '', `/board/${newBoardId}`);
      setShowNamePrompt(false);
    }
  };

  const handleJoinBoard = () => {
    if (username.trim() && joinCode.trim()) {
      setBoardId(joinCode.trim());
      window.history.pushState({}, '', `/board/${joinCode.trim()}`);
      setShowNamePrompt(false);
    }
  };

  if (showNamePrompt) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full">
          <div className="flex items-center justify-center mb-6">
            <Users className="w-12 h-12 text-blue-500" />
          </div>
          <h2 className="text-3xl font-bold text-center mb-2 text-gray-800">Collaborative Whiteboard</h2>
          <p className="text-center text-gray-600 mb-6">Draw together in real-time</p>
          
          <input
            type="text"
            placeholder="Enter your name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg mb-4 focus:border-blue-500 focus:outline-none text-lg"
            autoFocus
          />

          {!showJoinOption ? (
            <div className="space-y-3">
              <button
                onClick={handleCreateBoard}
                disabled={!username.trim()}
                className="w-full bg-blue-500 text-white py-3 rounded-lg font-semibold hover:bg-blue-600 transition-all disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Pencil size={20} />
                Create New Board
              </button>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-gray-500">OR</span>
                </div>
              </div>

              <button
                onClick={() => setShowJoinOption(true)}
                disabled={!username.trim()}
                className="w-full bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition-all disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Link2 size={20} />
                Join Existing Board
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Enter board code (e.g., abc1234)"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleJoinBoard()}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none text-lg"
              />
              
              <button
                onClick={handleJoinBoard}
                disabled={!username.trim() || !joinCode.trim()}
                className="w-full bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition-all disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Join Board
              </button>

              <button
                onClick={() => setShowJoinOption(false)}
                className="w-full bg-gray-200 text-gray-700 py-2 rounded-lg font-medium hover:bg-gray-300 transition-all"
              >
                Back
              </button>
            </div>
          )}

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-700 text-center">
              <span className="font-semibold">💡 Tip:</span> After creating a board, click the 
              <Link2 size={14} className="inline mx-1" />
              icon to copy the link and share with friends!
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <div className="w-20 bg-white shadow-lg flex flex-col items-center py-4 space-y-2">
        <div className="text-xs font-bold text-gray-600 mb-2">TOOLS</div>
        
        <button onClick={() => setTool("brush")} className={`p-3 rounded-lg transition-all ${tool === "brush" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`} title="Brush">
          <Pencil size={20} />
        </button>

        <button onClick={() => setTool("eraser")} className={`p-3 rounded-lg transition-all ${tool === "eraser" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`} title="Eraser">
          <Eraser size={20} />
        </button>

        <button onClick={() => setTool("fill")} className={`p-3 rounded-lg transition-all ${tool === "fill" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`} title="Fill">
          <Paintbrush size={20} />
        </button>

        <div className="w-16 h-px bg-gray-300 my-2" />
        
        <div className="text-xs font-bold text-gray-600 mb-2">SHAPES</div>

        <button onClick={() => setTool("line")} className={`p-3 rounded-lg transition-all ${tool === "line" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`} title="Line">
          <Minus size={20} />
        </button>

        <button onClick={() => setTool("rectangle")} className={`p-3 rounded-lg transition-all ${tool === "rectangle" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`} title="Rectangle">
          <Square size={20} />
        </button>

        <button onClick={() => setTool("circle")} className={`p-3 rounded-lg transition-all ${tool === "circle" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`} title="Circle">
          <Circle size={20} />
        </button>

        <div className="w-16 h-px bg-gray-300 my-2" />

        <button onClick={undo} disabled={historyStep <= 0} className={`p-3 rounded-lg transition-all ${historyStep <= 0 ? "bg-gray-100 text-gray-300 cursor-not-allowed" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`} title="Undo">
          <Undo2 size={20} />
        </button>

        <button onClick={redo} disabled={historyStep >= history.length - 1} className={`p-3 rounded-lg transition-all ${historyStep >= history.length - 1 ? "bg-gray-100 text-gray-300 cursor-not-allowed" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`} title="Redo">
          <Redo2 size={20} />
        </button>

        <div className="w-16 h-px bg-gray-300 my-2" />

        <button onClick={clearCanvas} className="p-3 rounded-lg bg-gray-100 text-gray-700 hover:bg-red-100 hover:text-red-600 transition-all" title="Clear">
          <Trash2 size={20} />
        </button>

        <button onClick={downloadCanvas} className="p-3 rounded-lg bg-gray-100 text-gray-700 hover:bg-green-100 hover:text-green-600 transition-all" title="Download">
          <Download size={20} />
        </button>

        <button onClick={copyBoardLink} className="p-3 rounded-lg bg-gray-100 text-gray-700 hover:bg-purple-100 hover:text-purple-600 transition-all" title="Copy Link">
          <Link2 size={20} />
        </button>

        <button onClick={() => setShowTimeline(!showTimeline)} className={`p-3 rounded-lg transition-all ${showTimeline ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`} title="Timeline">
          <Clock size={20} />
        </button>

        <div className="flex-1" />

        <div className="flex flex-col items-center gap-1 text-xs text-gray-600">
          <Users size={20} />
          <span className="font-semibold">{userCount}</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="bg-white shadow-md px-6 py-3 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-lg">
                <span className="text-sm font-medium text-blue-700">Board:</span>
                <span className="font-mono font-bold text-blue-900">{boardId}</span>
              </div>
              <div className="flex items-center gap-2 bg-green-50 px-3 py-1 rounded-lg">
                <User size={16} className="text-green-700" />
                <span className="text-sm font-medium text-green-900">{username}</span>
              </div>
              {activeUsers.length > 0 && (
                <div className="flex items-center gap-2 bg-purple-50 px-3 py-1 rounded-lg">
                  <Users size={16} className="text-purple-700" />
                  <div className="flex flex-wrap gap-1">
                    {activeUsers.map((user, idx) => (
                      <span key={idx} className="text-sm font-medium text-purple-900">
                        {user.username}{idx < activeUsers.length - 1 ? ',' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button onClick={replayDrawing} className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${isReplaying ? "bg-red-500 text-white hover:bg-red-600" : "bg-purple-500 text-white hover:bg-purple-600"}`}>
              {isReplaying ? <Pause size={16} /> : <Play size={16} />}
              <span className="text-sm font-medium">{isReplaying ? "Stop" : "Replay"}</span>
            </button>
          </div>

          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Brush:</span>
              <select value={brushType} onChange={(e) => setBrushType(e.target.value)} className="px-3 py-1 rounded-lg border-2 border-gray-300 text-sm focus:border-blue-500 focus:outline-none">
                <option value="normal">Normal</option>
                <option value="blur">Blur</option>
                <option value="spray">Spray</option>
                <option value="marker">Marker</option>
                <option value="glow">Glow</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">Size:</span>
              <input type="range" min="1" max="30" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="w-32" />
              <div className="flex items-center justify-center w-12 h-8 bg-gray-100 rounded text-sm font-medium text-gray-700">{brushSize}</div>
              <div className="rounded-full bg-gray-800 ml-2" style={{ width: Math.min(brushSize * 2, 30), height: Math.min(brushSize * 2, 30) }} />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Stroke:</span>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-10 h-8 rounded cursor-pointer" />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Fill:</span>
              <input type="color" value={fillColor === "transparent" ? "#ffffff" : fillColor} onChange={(e) => setFillColor(e.target.value)} className="w-10 h-8 rounded cursor-pointer" />
              <button onClick={() => setFillColor("transparent")} className={`px-2 py-1 rounded text-xs ${fillColor === "transparent" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700"}`}>None</button>
            </div>

            <div className="flex gap-1">
              {defaultColors.map(c => (
                <button key={c} onClick={() => setColor(c)} className={`w-6 h-6 rounded border-2 ${color === c ? "border-blue-500" : "border-gray-300"}`} style={{ backgroundColor: c }} title={c} />
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 p-2 relative">
            <div className="relative">
              <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseOut={handleMouseUp} className={`bg-white rounded-lg shadow-lg absolute top-0 left-0 ${tool === "fill" ? "cursor-pointer" : "cursor-crosshair"}`} style={{ display: "block" }} />
              <canvas ref={previewCanvasRef} className="absolute top-0 left-0 pointer-events-none" style={{ display: "block" }} />
              
              {Object.entries(userCursors).map(([id, cursor]) => (
                <div key={id} className="absolute pointer-events-none transition-all duration-100" style={{ left: cursor.x, top: cursor.y, transform: 'translate(-50%, -50%)' }}>
                  <div className="w-4 h-4 rounded-full border-2 border-white shadow-lg" style={{ backgroundColor: cursor.color }} />
                  <div className="mt-1 px-2 py-1 rounded text-xs font-medium text-white shadow-lg whitespace-nowrap" style={{ backgroundColor: cursor.color }}>{cursor.username}</div>
                </div>
              ))}
            </div>
          </div>

          {showTimeline && (
            <div className="w-80 bg-white shadow-lg p-4 overflow-y-auto">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Clock size={20} />
                Action Timeline
              </h3>
              <div className="space-y-2">
                {actionLog.slice().reverse().map((log, idx) => (
                  <div key={idx} className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <p className="text-sm">
                          <span className="font-semibold text-blue-600">{log.username}</span>
                          {' '}
                          <span className="text-gray-700">{log.action}</span>
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{log.timestamp}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {actionLog.length === 0 && (
                  <p className="text-center text-gray-400 py-8">No actions yet</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Canvas;