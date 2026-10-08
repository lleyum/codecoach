; CodeCoach installer (Inno Setup 6). Per-user install: no admin rights needed.
; Built by packaging/windows/build.ps1 - expects the app in ..\..\dist\CodeCoach-Windows
#ifndef AppVersion
  #define AppVersion "3.0"
#endif

[Setup]
AppId={{6A0F3E52-8C4B-4C0E-9C1E-2F7C0DECA0C3}
AppName=CodeCoach
AppVersion={#AppVersion}
AppPublisher=CodeCoach
DefaultDirName={localappdata}\Programs\CodeCoach
DefaultGroupName=CodeCoach
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\..\dist
OutputBaseFilename=CodeCoach-Windows-Setup
SetupIconFile=codecoach.ico
UninstallDisplayIcon={app}\CodeCoach.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"

[Files]
Source: "..\..\dist\CodeCoach-Windows\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{group}\CodeCoach"; Filename: "{app}\CodeCoach.exe"
Name: "{userdesktop}\CodeCoach"; Filename: "{app}\CodeCoach.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\CodeCoach.exe"; Description: "Open CodeCoach"; Flags: nowait postinstall skipifsilent
