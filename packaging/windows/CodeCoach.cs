// CodeCoach.exe - the Windows launcher. Starts CodeCoach's local server with the bundled Python,
// then opens it in its own app window (Microsoft Edge or Chrome in --app mode: no browser bars).
// Build: csc /target:winexe /win32icon:codecoach.ico /out:CodeCoach.exe CodeCoach.cs
using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

static class CodeCoach
{
    const int Port = 8765;
    static readonly string Url = "http://127.0.0.1:" + Port + "/";

    static bool Ping()
    {
        try
        {
            var req = (HttpWebRequest)WebRequest.Create(Url + "api/ping");
            req.Timeout = 900;
            req.Proxy = null;
            using (var r = (HttpWebResponse)req.GetResponse())
            using (var s = new StreamReader(r.GetResponseStream()))
                return s.ReadToEnd().Contains("\"ok\"");
        }
        catch { return false; }
    }

    static string Find(params string[] paths)
    {
        foreach (var p in paths)
            if (!string.IsNullOrEmpty(p) && File.Exists(p)) return p;
        return null;
    }

    [STAThread]
    static void Main()
    {
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        Directory.CreateDirectory(Path.Combine(home, ".codecoach"));

        if (!Ping())
        {
            string py = Path.Combine(dir, "python", "pythonw.exe");
            string server = Path.Combine(dir, "app", "server.py");
            if (!File.Exists(py) || !File.Exists(server))
            {
                MessageBox.Show("CodeCoach's files are missing. Please reinstall CodeCoach.", "CodeCoach", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
            var psi = new ProcessStartInfo(py, "-B \"" + server + "\" --port " + Port + " --no-browser")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                WorkingDirectory = Path.Combine(dir, "app"),
            };
            psi.EnvironmentVariables["CODECOACH_PACKAGED"] = "windows";
            psi.EnvironmentVariables["PYTHONUTF8"] = "1";
            Process.Start(psi);
            bool up = false;
            for (int i = 0; i < 80 && !up; i++) { Thread.Sleep(250); up = Ping(); }
            if (!up)
            {
                MessageBox.Show("CodeCoach could not start. Details are in " + Path.Combine(home, ".codecoach", "server.log"), "CodeCoach",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
        }

        string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string browser = Find(
            Path.Combine(pf86, @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(pf, @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(pf, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(pf86, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(local, @"Google\Chrome\Application\chrome.exe"));
        if (browser == null)
        {
            Process.Start(Url);
            return;
        }
        // its own browser profile: CodeCoach's window, settings and storage stay separate from your normal browsing
        string profile = Path.Combine(local, "CodeCoach", "window");
        Directory.CreateDirectory(profile);
        Process.Start(new ProcessStartInfo(browser,
            "--app=" + Url + " --user-data-dir=\"" + profile + "\" --window-size=1400,900 --no-first-run --no-default-browser-check --disable-features=Translate")
        { UseShellExecute = false });
    }
}
