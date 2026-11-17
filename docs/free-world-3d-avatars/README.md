# Free World 3D avatar integration

Development branch: `feature/free-world-3d-avatars`.

## Asset pack
Purchased Unity Asset Store low-poly medieval fantasy character pack. Keep original FBX models, textures, prefabs and `.unitypackage` files out of this public repository until the repository is made private and licence terms are reviewed.

## Integration plan
1. Review model and texture inventory and select one character for proof of concept.
2. Export an optimised `.glb` from the selected FBX, including textures, and verify animation and materials.
3. Use React Three Fiber / Three.js to preview it on a development-only Free World route.
4. Store an avatar identifier in user profiles, not the model bytes.
5. Test mobile performance and compatibility before considering a production rollout.

No live Free World code or production configuration is changed by this document.
