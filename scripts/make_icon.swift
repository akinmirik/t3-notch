import AppKit

// Reuse the notch critter's pixel silhouette, rendered at every macOS icon size.
let output = CommandLine.arguments[1]
try FileManager.default.createDirectory(atPath: output, withIntermediateDirectories: true)
let rows = ["..XXXX..", ".XXXXXX.", ".XoXXoX.", "XXXXXXXX", ".XXXXXX.", ".X....X."]
func drawIcon(size: Int, path: String) throws {
    let rep = NSBitmapImageRep(bitmapDataPlanes:nil, pixelsWide:size, pixelsHigh:size,
                              bitsPerSample:8, samplesPerPixel:4, hasAlpha:true,
                              isPlanar:false, colorSpaceName:.deviceRGB, bytesPerRow:0, bitsPerPixel:0)!
    let context = NSGraphicsContext(bitmapImageRep:rep)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    let scale = CGFloat(size) / 1024
    context.cgContext.scaleBy(x:scale,y:scale)
    let tile = NSBezierPath(roundedRect:NSRect(x:60,y:60,width:904,height:904),xRadius:210,yRadius:210)
    NSGradient(starting:NSColor(white:0.16,alpha:1),ending:NSColor(white:0.035,alpha:1))!.draw(in:tile,angle:-90)
    NSColor(white:1,alpha:0.12).setStroke(); tile.lineWidth=3; tile.stroke()
    let body = NSBezierPath()
    let eyes = NSBezierPath()
    let pixel:CGFloat = 76
    for (row,line) in rows.enumerated() {
        for (column,c) in line.enumerated() where c != "." {
            let rect = NSRect(x:208+CGFloat(column)*pixel,y:284+CGFloat(5-row)*pixel,width:pixel,height:pixel)
            body.appendRect(rect)
            if c == "o" { eyes.appendRect(rect.insetBy(dx:10,dy:6)) }
        }
    }
    NSGradient(starting:NSColor(red:0.30,green:0.94,blue:0.90,alpha:1),
               ending:NSColor(red:0.50,green:0.42,blue:1,alpha:1))!.draw(in:body,angle:-65)
    NSColor(white:0.045,alpha:1).setFill(); eyes.fill()
    NSGraphicsContext.restoreGraphicsState()
    try rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:path))
}
for points in [16,32,128,256,512] {
    try drawIcon(size:points,path:"\(output)/icon_\(points)x\(points).png")
    try drawIcon(size:points*2,path:"\(output)/icon_\(points)x\(points)@2x.png")
}
