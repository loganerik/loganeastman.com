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
var pad: CGFloat = 0.04
if let i = args.firstIndex(of: "--pad"), i + 1 < args.count, let v = Double(args[i + 1]) { pad = CGFloat(v) }

guard let ciImage = CIImage(contentsOf: inURL, options: [.applyOrientationProperty: true]) else { fputs("cannot read \(args[1])\n", stderr); exit(1) }
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
