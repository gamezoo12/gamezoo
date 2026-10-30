import re
p='/app/frontend/src/components/drawstudio/studio/Studio3D.jsx'; s=open(p).read()
s=s.replace("""    const t = clock.elapsedTime;
    camera.position.x +=""","""    const t = clock.elapsedTime;
    if (!camera.userData.framed) { camera.position.z = base * push; camera.userData.framed = true; }
    camera.position.x +=""",1)
open(p,'w').write(s)
p='/app/frontend/src/components/drawstudio/studio/StudioHud.jsx'; s=open(p).read()
s=s.replace("""  const showStats = !['revealed', 'complete'].includes(view.stage);""","""  const showStats = !['revealed', 'complete'].includes(view.stage);
  const narrow = w < 760;
  const tagY = narrow ? T - 92 * u : T;""",1)
s=s.replace("""fontSize={13 * u} position={[0, T, 0]} anchorY="top" color="#ff8fa3\"""","""fontSize={13 * u} position={[0, tagY, 0]} anchorY="top" color="#ff8fa3\"""",1)
s=s.replace("""fontSize={13 * u} position={[0, T, 0]} anchorY="top" color="#9fe8c4\"""","""fontSize={13 * u} position={[0, tagY, 0]} anchorY="top" color="#9fe8c4\"""",1)
open(p,'w').write(s)
p='/app/frontend/src/components/drawstudio/studio/DrawTheatre.jsx'; s=open(p).read()
s=s.replace('className="pointer-events-none absolute bottom-3 right-3 rounded-full','className="pointer-events-none absolute bottom-3 right-3 hidden rounded-full sm:inline',1)
open(p,'w').write(s)
print(s.count('hidden rounded-full sm:inline'))
