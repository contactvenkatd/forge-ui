/**
 * Geometry-based component counting, independent of what the model claims.
 *
 * Groups solids by the angle of their centroid about the assembly's central
 * axis, so a leg built from four solids counts as ONE leg. Central parts (hub,
 * spindle, centre column) sit near the axis and are excluded - they are not
 * repeated structural components.
 */
import * as M0 from '@jscad/modeling'
const M = M0.default ?? M0

/** Shortest angular separation between two bearings, in degrees. */
function angularGap(a, b) {
  const raw = Math.abs(a - b) % 360
  return raw > 180 ? 360 - raw : raw
}

/** Circular mean, so a cluster straddling +-180 does not average to zero. */
function circularMean(anglesDeg) {
  let x = 0
  let y = 0
  for (const angle of anglesDeg) {
    x += Math.cos((angle * Math.PI) / 180)
    y += Math.sin((angle * Math.PI) / 180)
  }
  return (Math.atan2(y, x) * 180) / Math.PI
}

export function radialGroups(solids, { minRadiusFraction = 0.15, toleranceDeg = 35 } = {}) {
  if (!solids?.length) return { groups: 0, clusters: [], offCentreParts: 0, totalParts: 0 }

  const boxes = solids.map((s) => M.measurements.measureBoundingBox(s))
  const centroids = boxes.map((b) => [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2])
  // Mean of part centroids, NOT the bounding-box centre: for a 3-fold pattern the
  // bounding box is asymmetric and its centre sits off-axis, which skews every
  // bearing. Evenly spaced legs cancel in the mean, landing it on the hub.
  const mean = [0, 1].map((a) => centroids.reduce((sum, c) => sum + c[a], 0) / centroids.length)
  // The mean is only a first guess: an asymmetric layout (two legs instead of
  // three, a clock face with two hands) drags it off the hub, which then reads as
  // an extra off-centre component. Anchor on the most central PART instead, which
  // is the hub, face or pivot in every arrangement.
  let anchor = 0
  let anchorDistance = Infinity
  centroids.forEach((c, i) => {
    const d = Math.hypot(c[0] - mean[0], c[1] - mean[1])
    if (d < anchorDistance) { anchorDistance = d; anchor = i }
  })
  const centre = centroids[anchor]

  const points = centroids.map(([cx0, cy0], index) => {
    const cx = cx0 - centre[0]
    const cy = cy0 - centre[1]
    return { index, r: Math.hypot(cx, cy), angle: (Math.atan2(cy, cx) * 180) / Math.PI }
  })

  const maxRadius = Math.max(...points.map((p) => p.r), 1e-9)
  const outer = points.filter((p) => p.r > maxRadius * minRadiusFraction)

  // Greedy angular clustering: a part joins the first cluster within tolerance of
  // its running circular mean, so several solids on one leg collapse together.
  const clusters = []
  for (const point of [...outer].sort((a, b) => b.r - a.r)) {
    const hit = clusters.find((c) => angularGap(c.angle, point.angle) < toleranceDeg)
    if (hit) {
      hit.members.push(point.index)
      hit.angles.push(point.angle)
      hit.angle = circularMean(hit.angles)
    } else {
      clusters.push({ angle: point.angle, angles: [point.angle], members: [point.index] })
    }
  }

  return {
    groups: clusters.length,
    clusters: clusters.map((c) => ({ angle: Math.round(c.angle), parts: c.members.length })),
    offCentreParts: outer.length,
    centralParts: points.length - outer.length,
    totalParts: solids.length,
  }
}
