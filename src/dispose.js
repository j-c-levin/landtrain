// Releases every GPU buffer a subtree owns; shared textures are released once.
export function disposeSubtree(rootObj) {
  const seenTex = new Set();
  const disposeMat = (mat) => {
    if (!mat) return;
    for (const key of Object.keys(mat)) {
      const val = mat[key];
      if (val && val.isTexture && !seenTex.has(val)) {
        seenTex.add(val);
        val.dispose();
      }
    }
    mat.dispose();
  };
  rootObj.traverse((obj) => {
    if (obj.isMesh || obj.isInstancedMesh || obj.isSprite) {
      if (obj.geometry) obj.geometry.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach(disposeMat);
      else disposeMat(mat);
      if (obj.instanceColor) obj.instanceColor.dispose?.();
    }
  });
}
