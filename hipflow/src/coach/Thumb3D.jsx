import { useEffect, useState } from "react";
import { snapshot } from "./snapshot.js";

// Picture of the finished stretch (rendered from the 3D coach).
export default function Thumb3D({ id, alt = "", size = "thumb", className = "" }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let on = true;
    snapshot(id, size).then((s) => on && setSrc(s));
    return () => { on = false; };
  }, [id, size]);
  return src ? <img className={`thumb3d ${className}`} src={src} alt={alt} draggable="false" /> : <div className={`thumb3d placeholder ${className}`} aria-hidden="true" />;
}
