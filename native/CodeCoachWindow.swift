// CodeCoach's Mac app: a native window (no browser bars) around the local CodeCoach page.
// Two ways it runs:
//  - downloaded app: CodeCoach.app/Contents/Resources/{app,python} - starts its own server and stops it on quit
//  - source folder:  built on first launch by launch.sh (swiftc), which starts the server itself
import Cocoa
import WebKit

let startURL: URL = {
    for a in CommandLine.arguments.dropFirst() where a.hasPrefix("http") {
        if let u = URL(string: a) { return u }
    }
    return URL(string: "http://127.0.0.1:8765/")!
}()

func hexColor(_ hex: String) -> NSColor? {
    var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.hasPrefix("#") { s.removeFirst() }
    guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
    return NSColor(srgbRed: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255, blue: CGFloat(v & 255) / 255, alpha: 1)
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var retries = 0
    var startedServer = false
    var flushed = false
    var lastDownload: URL?
    var server: Process?
    // what to note when macOS ends the page's process (see webViewWebContentProcessDidTerminate)
    var memWatch: DispatchSourceMemoryPressure?
    var lastPressure: String?
    var lastStats = ""
    let launchedAt = Date()

    // Resources of the downloadable app (nil when running from a source folder)
    lazy var bundledApp: String? = {
        guard let res = Bundle.main.resourcePath else { return nil }
        let app = res + "/app/server.py"
        return FileManager.default.fileExists(atPath: app) ? res : nil
    }()

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        let cfg = WKWebViewConfiguration()
        let ucc = WKUserContentController()
        ucc.addUserScript(WKUserScript(source: "document.documentElement.classList.add('cc-native'); window.CC_NATIVE = true; window.CC_NATIVE_V = 3;",
                                       injectionTime: .atDocumentStart, forMainFrameOnly: true))
        ucc.add(self, name: "cc")
        cfg.userContentController = ucc
        cfg.preferences.setValue(true, forKey: "developerExtrasEnabled")
        web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1380, height: 880), configuration: cfg)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsMagnification = true
        web.autoresizingMask = [.width, .height]

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1380, height: 880),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "CodeCoach"
        window.titlebarAppearsTransparent = true
        window.minSize = NSSize(width: 760, height: 520)
        window.collectionBehavior = [.fullScreenPrimary]
        window.contentView = web
        window.delegate = self
        window.center()
        window.setFrameAutosaveName("CodeCoachMainWindow")
        if let bg = UserDefaults.standard.string(forKey: "bg"), let c = hexColor(bg) { window.backgroundColor = c }
        if UserDefaults.standard.object(forKey: "dark") != nil {
            window.appearance = NSAppearance(named: UserDefaults.standard.bool(forKey: "dark") ? .darkAqua : .aqua)
        }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        if bundledApp != nil { startedServer = true; startServer() }
        web.load(URLRequest(url: startURL))
        // log when the Mac runs low on memory: the usual reason macOS ends a window's page process
        let mw = DispatchSource.makeMemoryPressureSource(eventMask: [.warning, .critical], queue: .main)
        mw.setEventHandler { [weak self] in
            guard let self = self else { return }
            let level = mw.data.contains(.critical) ? "critical" : "warning"
            self.lastPressure = level + " at " + ISO8601DateFormatter().string(from: Date())
            self.logEvent("Mac memory pressure: " + level)
        }
        mw.resume()
        memWatch = mw
    }

    func applicationWillTerminate(_ notification: Notification) {
        // the downloaded app owns its server: stop it so nothing keeps running (and using battery) after you quit
        if let p = server, p.isRunning { p.terminate() }
    }

    // ---------------------------------------------------------------- menus (gives Cmd+C/V/Z, full screen, zoom, quit)
    func buildMenu() {
        let main = NSMenu()
        func item(_ title: String, _ action: Selector?, _ key: String, _ mods: NSEvent.ModifierFlags = [.command]) -> NSMenuItem {
            let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
            i.keyEquivalentModifierMask = mods
            return i
        }
        func submenu(_ title: String, _ items: [NSMenuItem]) {
            let top = NSMenuItem()
            let m = NSMenu(title: title)
            items.forEach { m.addItem($0) }
            top.submenu = m
            main.addItem(top)
        }
        submenu("CodeCoach", [
            item("About CodeCoach", #selector(NSApplication.orderFrontStandardAboutPanel(_:)), ""),
            NSMenuItem.separator(),
            item("Hide CodeCoach", #selector(NSApplication.hide(_:)), "h"),
            item("Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]),
            NSMenuItem.separator(),
            item("Quit CodeCoach", #selector(NSApplication.terminate(_:)), "q"),
        ])
        submenu("Edit", [
            item("Undo", Selector(("undo:")), "z"),
            item("Redo", Selector(("redo:")), "z", [.command, .shift]),
            NSMenuItem.separator(),
            item("Cut", #selector(NSText.cut(_:)), "x"),
            item("Copy", #selector(NSText.copy(_:)), "c"),
            item("Paste", #selector(NSText.paste(_:)), "v"),
            item("Select All", #selector(NSText.selectAll(_:)), "a"),
        ])
        submenu("View", [
            item("Reload", #selector(reloadPage), "r"),
            NSMenuItem.separator(),
            item("Actual Size", #selector(zoomReset), "0"),
            item("Zoom In", #selector(zoomIn), "="),
            item("Zoom Out", #selector(zoomOut), "-"),
            NSMenuItem.separator(),
            item("Toggle Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control]),
        ])
        submenu("Window", [
            item("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"),
            item("Close", #selector(NSWindow.performClose(_:)), "w"),
        ])
        NSApp.mainMenu = main
    }

    @objc func reloadPage() { logEvent("reload from menu / Cmd+R"); web.reload() }

    // ~/.codecoach/window.log: why the page reloaded, so random refreshes can be traced
    func logEvent(_ msg: String) {
        let url = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".codecoach/window.log")
        let line = ISO8601DateFormatter().string(from: Date()) + "  " + msg + "\n"
        if let h = try? FileHandle(forWritingTo: url) { h.seekToEndOfFile(); h.write(line.data(using: .utf8)!); try? h.close() }
        else { try? line.write(to: url, atomically: true, encoding: .utf8) }
    }
    @objc func zoomReset() { web.pageZoom = 1.0 }
    @objc func zoomIn() { web.pageZoom = min(2.0, web.pageZoom + 0.1) }
    @objc func zoomOut() { web.pageZoom = max(0.6, web.pageZoom - 0.1) }

    // ---------------------------------------------------------------- lifecycle
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if flushed || web == nil { return .terminateNow }
        // let the page save the open session before the window goes away
        web.evaluateJavaScript("(window.CC && CC.flushSave) ? (CC.flushSave(), true) : false") { _, _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                self.flushed = true
                NSApp.reply(toApplicationShouldTerminate: true)
            }
        }
        return .terminateLater
    }

    // ---------------------------------------------------------------- page -> app messages (theme colors, quit)
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let d = message.body as? [String: Any] else { return }
        if let bg = d["bg"] as? String, let c = hexColor(bg) {
            window.backgroundColor = c
            UserDefaults.standard.set(bg, forKey: "bg")
        }
        if let dark = d["dark"] as? Bool {
            window.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
            UserDefaults.standard.set(dark, forKey: "dark")
        }
        if d["quit"] != nil {
            flushed = true
            NSApp.terminate(nil)
        }
        if let fs = d["fullscreen"] as? Bool, window.styleMask.contains(.fullScreen) != fs {   // exam lockdown
            window.toggleFullScreen(nil)
        }
        if let st = d["stats"] as? String { lastStats = st }                 // page size snapshot, sent every few minutes
        if let err = d["jsError"] as? String { logEvent("page error: " + String(err.prefix(400))) }
        if let prompt = d["pickFolder"] as? String {
            let panel = NSOpenPanel()
            panel.canChooseDirectories = true
            panel.canChooseFiles = false
            panel.canCreateDirectories = true
            panel.allowsMultipleSelection = false
            panel.message = prompt
            panel.prompt = "Choose"
            if let start = d["start"] as? String, !start.isEmpty { panel.directoryURL = URL(fileURLWithPath: start) }
            panel.beginSheetModal(for: window) { r in
                let path = r == .OK ? (panel.url?.path ?? "") : ""
                let json = (try? String(data: JSONSerialization.data(withJSONObject: [path]), encoding: .utf8)) ?? "[\"\"]"
                self.web.evaluateJavaScript("window.CC && CC._folderPicked && CC._folderPicked(\(json)[0])", completionHandler: nil)
            }
        }
    }

    // full screen left with the green button or Esc: the page notes it during an exam
    func windowDidEnterFullScreen(_ notification: Notification) {
        web.evaluateJavaScript("window.CC && CC._nativeFullscreen && CC._nativeFullscreen(true)", completionHandler: nil)
    }
    func windowDidExitFullScreen(_ notification: Notification) {
        web.evaluateJavaScript("window.CC && CC._nativeFullscreen && CC._nativeFullscreen(false)", completionHandler: nil)
    }

    // ---------------------------------------------------------------- navigation: keep CodeCoach inside, open everything else outside
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.shouldPerformDownload { decisionHandler(.download); return }
        guard let url = action.request.url else { decisionHandler(.allow); return }
        let scheme = (url.scheme ?? "").lowercased()
        if scheme == "http" || scheme == "https" {
            let host = (url.host ?? "").lowercased()
            if host == "127.0.0.1" || host == "localhost" { decisionHandler(.allow); return }
            NSWorkspace.shared.open(url)          // e.g. openrouter.ai links -> default browser
            decisionHandler(.cancel)
            return
        }
        if scheme == "about" || scheme == "blob" || scheme == "data" { decisionHandler(.allow); return }
        NSWorkspace.shared.open(url)              // obsidian:// and other app links
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if !response.canShowMIMEType { decisionHandler(.download); return }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        // Only retry when CodeCoach's server can't be reached. Cancelled navigations (links we open in other apps,
        // downloads, "frame load interrupted") also land here and must NOT reload the page.
        let e = error as NSError
        let unreachable = e.domain == NSURLErrorDomain &&
            [NSURLErrorCannotConnectToHost, NSURLErrorNetworkConnectionLost, NSURLErrorTimedOut, NSURLErrorCannotFindHost, NSURLErrorNotConnectedToInternet].contains(e.code)
        if !unreachable { return }
        if let failing = e.userInfo[NSURLErrorFailingURLErrorKey] as? URL, failing.host != startURL.host || failing.port != startURL.port { return }
        retries += 1
        if retries == 1 { logEvent("server unreachable (\(e.code)) - retrying") }
        if bundledApp != nil {
            // the downloaded app owns its server: if it isn't running (crashed, or replaced by another launch), start it again
            if server?.isRunning != true && retries % 4 == 1 { logEvent("server not running - starting it"); startServer() }
        } else if !startedServer { startedServer = true; startServer() }
        if retries > 55 {
            web.loadHTMLString("<body style='font:15px -apple-system;padding:40px;color:#888'><h2>CodeCoach couldn't start</h2><p>Quit and open CodeCoach again. Details are in ~/.codecoach/server.log</p></body>", baseURL: nil)
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.75) { webView.load(URLRequest(url: startURL)) }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { retries = 0 }

    // If macOS kills the page's process (e.g. low memory), bring the page back; the session autosaves continuously.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        let mins = Int(Date().timeIntervalSince(launchedAt) / 60)
        let visible = window.occlusionState.contains(.visible)
        let app: String = NSApp.isActive ? "active" : "in background"
        let win: String = visible ? "visible" : "hidden"
        let pressure: String = lastPressure ?? "none"
        let page: String = lastStats.isEmpty ? "?" : lastStats
        logEvent("page process ended - reloading; the app reopens your session. app \(app), window \(win), running \(mins) min, last memory pressure: \(pressure), page: \(page)")
        var c = URLComponents(url: startURL, resolvingAgainstBaseURL: false)
        c?.queryItems = [URLQueryItem(name: "recovered", value: "1")]
        webView.load(URLRequest(url: c?.url ?? startURL))
    }

    func startServer() {
        let home = FileManager.default.homeDirectoryForCurrentUser
        if let res = bundledApp {
            let logDir = home.appendingPathComponent(".codecoach")
            try? FileManager.default.createDirectory(at: logDir, withIntermediateDirectories: true)
            let logURL = logDir.appendingPathComponent("server.log")
            FileManager.default.createFile(atPath: logURL.path, contents: nil)
            let py = FileManager.default.isExecutableFile(atPath: res + "/python/bin/python3") ? res + "/python/bin/python3" : "/usr/bin/python3"
            let p = Process()
            p.executableURL = URL(fileURLWithPath: py)
            p.arguments = ["-B", res + "/app/server.py", "--port", String(startURL.port ?? 8765), "--no-browser",
                           "--parent-pid", String(ProcessInfo.processInfo.processIdentifier)]
            p.currentDirectoryURL = URL(fileURLWithPath: res + "/app")
            var env = ProcessInfo.processInfo.environment
            // apps start with a minimal PATH: add the usual places for javac, g++, node, go, rustc
            env["PATH"] = ["/opt/homebrew/bin", "/usr/local/bin", home.path + "/.cargo/bin", "/usr/local/go/bin", home.path + "/.local/bin",
                           env["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin"].joined(separator: ":")
            env["CODECOACH_PACKAGED"] = "mac"
            env["PYTHONDONTWRITEBYTECODE"] = "1"
            p.environment = env
            if let h = try? FileHandle(forWritingTo: logURL) { p.standardOutput = h; p.standardError = h }
            do { try p.run(); server = p } catch { logEvent("couldn't start the server: \(error)") }
            return
        }
        var dir = home.appendingPathComponent("learn/CodeCoach").path
        if let s = try? String(contentsOf: home.appendingPathComponent(".codecoach/app_path"), encoding: .utf8) {
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            if !t.isEmpty { dir = t }
        }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/bash")
        p.arguments = [dir + "/launch.sh", dir, "app"]
        try? p.run()
    }

    // ---------------------------------------------------------------- downloads (backup zip, "download as file")
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let dir = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
        let base = (suggestedFilename as NSString).deletingPathExtension
        let ext = (suggestedFilename as NSString).pathExtension
        var dest = dir.appendingPathComponent(suggestedFilename)
        var i = 2
        while FileManager.default.fileExists(atPath: dest.path) {
            dest = dir.appendingPathComponent(ext.isEmpty ? "\(base) (\(i))" : "\(base) (\(i)).\(ext)")
            i += 1
        }
        lastDownload = dest
        completionHandler(dest)
    }

    func downloadDidFinish(_ download: WKDownload) {
        if let d = lastDownload { NSWorkspace.shared.activateFileViewerSelecting([d]) }
    }

    // ---------------------------------------------------------------- file picker, dialogs, links that open new windows
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.beginSheetModal(for: window) { r in completionHandler(r == .OK ? panel.urls : nil) }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert()
        a.messageText = message
        a.addButton(withTitle: "OK")
        a.beginSheetModal(for: window) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert()
        a.messageText = message
        a.addButton(withTitle: "OK")
        a.addButton(withTitle: "Cancel")
        a.beginSheetModal(for: window) { r in completionHandler(r == .alertFirstButtonReturn) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let a = NSAlert()
        a.messageText = prompt
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 24))
        field.stringValue = defaultText ?? ""
        a.accessoryView = field
        a.addButton(withTitle: "OK")
        a.addButton(withTitle: "Cancel")
        a.window.initialFirstResponder = field
        a.beginSheetModal(for: window) { r in completionHandler(r == .alertFirstButtonReturn ? field.stringValue : nil) }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = navigationAction.request.url { NSWorkspace.shared.open(u) }
        return nil
    }

    func webViewDidClose(_ webView: WKWebView) { NSApp.terminate(nil) }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
