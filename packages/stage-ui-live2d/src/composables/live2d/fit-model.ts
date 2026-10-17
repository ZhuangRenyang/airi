import type { MaybeRefOrGetter } from 'vue'

import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { computed, toValue } from 'vue'

const breakpoints = useBreakpoints(breakpointsTailwind)

/**
 *  Normalizes the model so that user `scale == 1` means twice the viewport height,
 *  and the model centered horizontally when `position.x == 0`,
 *  showing upper half of the body when `position.y == 0`
 *
 *  On narrow (<= md) viewports the model is instead contained: scaled to fit
 *  entirely inside the viewport with a margin, and bottom-aligned near the
 *  lower edge so the whole body stays visible.
 */
export function useFitModel(
  canvasDim: MaybeRefOrGetter<{ width: number, height: number }>,
  modelDim: MaybeRefOrGetter<{ width: number, height: number }>,
) {
  const normalizedParam = computed(() => {
    const canvas = toValue(canvasDim)
    const model = toValue(modelDim)

    const narrow = breakpoints.smallerOrEqual('md').value

    // NOTICE: the previous single formula (2x height / 2x width targets, min())
    // zoomed mobile portrait into the torso: the fit targets are tuned for the
    // desktop "upper half" framing, which overflows a tall narrow screen.
    // Removal condition: replace with an aspect-aware fit accepted upstream.
    const heightFactor = narrow ? 0.9 : 2
    const widthFactor = narrow ? 1 : 2

    const heightScale = (canvas.height / model.height * heightFactor)
    const widthScale = (canvas.width / model.width * widthFactor)
    let minScale = Math.min(heightScale, widthScale)

    if (Number.isNaN(minScale) || minScale <= 0) {
      minScale = 1e-6
    }

    // Bottom-align with a 5% margin: with scale <= 0.9x the viewport the whole
    // model is guaranteed on screen (top edge >= 5% of the viewport height).
    const y = narrow
      ? canvas.height - (model.height * minScale) / 2 - canvas.height * 0.05
      : canvas.height // upper half on desktop/landscape

    return {
      scale: minScale,
      x: canvas.width / 2,
      y,
    }
  })

  return normalizedParam
}
