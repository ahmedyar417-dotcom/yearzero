import { useContext, useEffect, useState } from "react";
import { CoachContext } from "./CoachContext.js";
import { snapshot } from "./snapshot.js";

// Picture of the finished stretch (rendered from the 3D coach).
export default function Thumb3D({ id, alt = "", size = "thumb", className = "", coach }) {
  const ctxCoach = useContext(CoachContext);
  const who = coach || ctxCoach;
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let on = true;
    snapshot(id, size, who).then((s) => on && setSrc(s));
    return () => { on = false; };
  }, [id, size, who]);
  return src ? <img className={`thumb3d ${className}`} src={src} alt={alt} draggable="false" /> : <div className={`thumb3d placeholder ${className}`} aria-hidden="true" />;
}
