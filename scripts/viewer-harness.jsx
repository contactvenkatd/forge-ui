import { createRoot } from 'react-dom/client'
import { StrictMode, createElement, createRef, useState, useEffect } from 'react'
import '../src/index.css'
import ModelViewer from '../src/ModelViewer.jsx'
import { runJscad } from '../src/jscadRuntime.js'
import { ASSEMBLY_FIXTURE, FIXTURE_MATERIALS } from './fixture.js'

const viewerRef = createRef()
window.__viewerRef = viewerRef

// Mounts with NO geometry first, so the test can prove the loop runs before any
// model exists. window.__loadModel() then injects the 5-part assembly.
function Harness() {
  const [solids, setSolids] = useState(null)
  const [wireframe, setWireframe] = useState(false)
  const [offsets, setOffsets] = useState({})
  useEffect(() => {
    window.__loadModel = () => setSolids(runJscad(ASSEMBLY_FIXTURE))
    window.__loadCode = (code) => setSolids(runJscad(code))
    window.__setWireframe = (v) => setWireframe(v)
    window.__setOffset = (index, axis, value) => setOffsets((c) => ({ ...c, [index]: { axis, value } }))
    window.__resetOffsets = () => setOffsets({})
    window.__meshPositions = () => {
      const out = {}
      for (const m of window.__modelGroup?.children ?? []) {
        out[m.userData.partIndex] = [m.position.x, m.position.y, m.position.z]
      }
      return out
    }
    window.__harnessReady = true
  }, [])
  return createElement(ModelViewer, {
    ref: viewerRef, solids, theme: 'dark', materials: FIXTURE_MATERIALS,
    units: 'metric', wireframe, offsets,
  })
}

createRoot(document.getElementById('root')).render(createElement(StrictMode, null, createElement(Harness)))
