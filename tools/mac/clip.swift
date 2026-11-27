// Magic-eraser cutout with Apple Vision (macOS 14+): lifts the most prominent foreground subject, keeps natural
// edges, pads the transparent canvas a little. Usage: swift clip.swift in.jpg out.png [--all] [--pad 0.04]
import Foundation
import Vision
import CoreImage
import AppKit

let args = CommandLine.arguments
guard args.count >= 3 else { fputs("usage: clip.swift <in> <out.png> [--all] [--pad 0.04]\n", stderr); exit(2) }
let inURL = URL(fileURLWithPath: args[1]); let outURL = URL(fileURLWithPath: args[2])
let keepAll = args.contains("--all")
let trimOnly = args.contains("--trim")
var pad: CGFloat = 0.04
if let i = args.firstIndex(of: "--pad"), i + 1 < args.count, let v = Double(args[i + 1]) { pad = CGFloat(v) }

guard let ciImage = CIImage(contentsOf: inURL, options: [.applyOrientationProperty: true]) else { fputs("cannot read \(args[1])\n", stderr); exit(1) }

// --trim: crop away near-white (or near-transparent) margins and keep the rest whole. For covers and product shots on white.
if trimOnly {
  let ctx0 = CIContext(options: [.workingColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!])
  guard let cg0 = ctx0.createCGImage(ciImage, from: ciImage.extent) else { fputs("render failed\n", stderr); exit(1) }
  let w = cg0.width, h = cg0.height
  var data = [UInt8](repeating: 0, count: w * h * 4)
  let cs = CGColorSpaceCreateDeviceRGB()
  guard let bctx = CGContext(data: &data, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { exit(1) }
  bctx.draw(cg0, in: CGRect(x: 0, y: 0, width: w, height: h))
  func isBg(_ x: Int, _ y: Int) -> Bool {
    let i = (y * w + x) * 4
    let r = Int(data[i]), g = Int(data[i+1]), b = Int(data[i+2]), a = Int(data[i+3])
    return a < 16 || (r > 238 && g > 238 && b > 238)
  }
  var top = 0, bottom = h - 1, left = 0, right = w - 1
  func rowBg(_ y: Int) -> Bool { var n = 0; for x in stride(from: 0, to: w, by: max(1, w / 400)) { if !isBg(x, y) { n += 1; if n > 2 { return false } } }; return true }
  func colBg(_ x: Int) -> Bool { var n = 0; for y in stride(from: 0, to: h, by: max(1, h / 400)) { if !isBg(x, y) { n += 1; if n > 2 { return false } } }; return true }
  while top < bottom && rowBg(top) { top += 1 }
  while bottom > top && rowBg(bottom) { bottom -= 1 }
  while left < right && colBg(left) { left += 1 }
  while right > left && colBg(right) { right -= 1 }
  let m = Int(Double(min(w, h)) * 0.01) // keep a hair of margin
  let crop = CGRect(x: max(0, left - m), y: max(0, top - m), width: min(w, right + m) - max(0, left - m) + 1, height: min(h, bottom + m) - max(0, top - m) + 1)
  guard crop.width > 8, crop.height > 8, let cropped = cg0.cropping(to: crop) else { fputs("nothing to trim\n", stderr); exit(3) }
  let rep = NSBitmapImageRep(cgImage: cropped)
  guard let png = rep.representation(using: .png, properties: [:]) else { exit(1) }
  do { try png.write(to: outURL) } catch { fputs("write failed: \(error)\n", stderr); exit(1) }
  print("\(outURL.path) \(Int(crop.width))x\(Int(crop.height)) (trimmed)")
  exit(0)
}
let handler = VNImageRequestHandler(ciImage: ciImage, options: [:])
let request = VNGenerateForegroundInstanceMaskRequest()
do { try handler.perform([request]) } catch { fputs("vision failed: \(error)\n", stderr); exit(1) }
guard let result = request.results?.first else { fputs("no foreground found\n", stderr); exit(3) }
let instances = keepAll ? result.allInstances : IndexSet(integer: result.allInstances.first ?? 1)
let masked: CVPixelBuffer
do { masked = try result.generateMaskedImage(ofInstances: instances, from: handler, croppedToInstancesExtent: true) } catch { fputs("mask failed: \(error)\n", stderr); exit(1) }

let cut = CIImage(cvPixelBuffer: masked)
let extent = cut.extent
let padX = extent.width * pad, padY = extent.height * pad
let canvas = CGRect(x: extent.minX - padX, y: extent.minY - padY, width: extent.width + 2 * padX, height: extent.height + 2 * padY)
let ctx = CIContext(options: [.workingColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!])
guard let cg = ctx.createCGImage(cut, from: canvas) else { fputs("render failed\n", stderr); exit(1) }
let rep = NSBitmapImageRep(cgImage: cg)
guard let png = rep.representation(using: .png, properties: [:]) else { fputs("png failed\n", stderr); exit(1) }
do { try png.write(to: outURL) } catch { fputs("write failed: \(error)\n", stderr); exit(1) }
print("\(outURL.path) \(Int(canvas.width))x\(Int(canvas.height))")
