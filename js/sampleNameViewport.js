import ViewportBase from './viewportBase.js'
import IGVGraphics from './igv-canvas.js'
import { appleCrayonRGB, appleCrayonRGBA, appleCrayonPalette, greyScale, randomGrey } from './util/colorPalletes'
import $ from "./vendor/jquery-3.3.1.slim";

const sampleNameViewportWidth = 128

class SampleNameViewport extends ViewportBase {

    constructor(trackView, $viewportContainer, referenceFrame, width) {
        super(trackView, $viewportContainer, referenceFrame, width)
    }

    initializationHelper() {

        this.$viewport.data('viewport-type', 'sample-name')

        // mono-sample canvas
        const $mono_sample_canvas = $('<canvas>', { class:'igv-mono-sample-canvas' })
        this.$viewport.append($mono_sample_canvas)

        this.mono_sample_ctx = $mono_sample_canvas.get(0).getContext('2d')

    }

    drawTrackName(name) {

        // Hide multi-sample canvas
        this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height)

        const w = this.$viewport.width()
        const h = this.$viewport.height()

        configureHighDPICanvas(this.mono_sample_ctx, w, h)

        IGVGraphics.fillRect(this.mono_sample_ctx, 0, 0, this.mono_sample_ctx.canvas.width, this.mono_sample_ctx.canvas.height, { 'fillStyle': appleCrayonRGBA('snow', 1) })

        configureFont(this.mono_sample_ctx, fontConfig)

        const { width, actualBoundingBoxAscent, actualBoundingBoxDescent } = this.mono_sample_ctx.measureText(name)
        this.mono_sample_ctx.fillText(name, Math.round(w - 4), Math.round((h + actualBoundingBoxAscent)/2))

    }

    draw(features, canvasTop, height, sampleNameRenderer) {

        // hide mono-sample canvas
        this.mono_sample_ctx.clearRect(0, 0, this.mono_sample_ctx.canvas.width, this.mono_sample_ctx.canvas.height)

        configureHighDPICanvas(this.ctx, this.$viewport.width(), height)

        IGVGraphics.fillRect(this.ctx, 0, 0, this.ctx.canvas.width, this.ctx.canvas.height, { 'fillStyle': appleCrayonRGBA('snow', 1) })

        configureFont(this.ctx, fontConfig)

        sampleNameRenderer(this.ctx, features, canvasTop, this.$viewport.width(), height)
    }

    setTop(contentTop) {
        this.$content.css('top', `${ contentTop }px`);
    }

}

function configureHighDPICanvas(ctx, w, h) {

    const scaleFactor = window.devicePixelRatio
    // const scaleFactor = 1

    ctx.canvas.style.width = (`${ w }px`)
    ctx.canvas.width = Math.floor(scaleFactor * w)

    ctx.canvas.style.height = (`${ h }px`)
    ctx.canvas.height = Math.floor(scaleFactor * h)

    ctx.scale(scaleFactor, scaleFactor)

}

const fontConfig =
    {
        font: '10px sans-serif',
        textAlign: 'end', // start || end
        textBaseline: 'bottom',
        strokeStyle: 'black',
        fillStyle:'black'
    };

function configureFont(ctx, { font, textAlign, textBaseline, strokeStyle, fillStyle }) {
    ctx.font = font
    ctx.textAlign = textAlign
    ctx.textBaseline = textBaseline
    ctx.fillStyle = fillStyle
}

export { sampleNameViewportWidth }

export default SampleNameViewport