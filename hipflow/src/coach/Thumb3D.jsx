import { useEffect, useState } from "react";
import { snapshot } from "./snapshot.js";

// Picture of the finished stretch (rendered from the 3D coach).
export default function Thumb3D({ id, alt = "" }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let on = true;
    snapshot(id).then((s) => on && setSrc(s));
    return () => { on = false; };
  }, [id]);
  return src ? <img className="thumb3d" src={src} alt={alt} /> : <div className="thumb3d placeholder" aria-hidden="true" />;
}
