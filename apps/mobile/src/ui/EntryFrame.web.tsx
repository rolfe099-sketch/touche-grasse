import { PropsWithChildren, useEffect, useState } from 'react';
import { View } from 'react-native';

// Mobile browsers can shrink only the visual viewport when a keyboard opens.
// Keep the entire entry frame (including its footer) in the visible area.
export function EntryFrame({ children }: PropsWithChildren) {
  const [viewport, setViewport] = useState<{ height: number; top: number }>();
  useEffect(() => {
    const visual = window.visualViewport;
    const update = () => setViewport({ height: visual?.height ?? window.innerHeight, top: visual?.offsetTop ?? 0 });
    update(); visual?.addEventListener('resize', update); visual?.addEventListener('scroll', update); window.addEventListener('resize', update);
    return () => { visual?.removeEventListener('resize', update); visual?.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);
  return <View style={viewport ? { position: 'absolute', left: 0, right: 0, top: viewport.top, height: viewport.height } : { flex: 1 }}>{children}</View>;
}
