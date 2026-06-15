!macro preInit
  ; 设置默认安装目录为 %LOCALAPPDATA%\Programs\ZMCL
  SetRegView 64
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\ZMCL"
  ; 启用 DPI 感知，解决高 DPI 屏幕下安装界面模糊问题
  System::Call 'user32::SetProcessDPIAware()'
!macroend

!macro customUnInit
  ; 卸载时清理用户数据
  RMDir /r "$APPDATA\Zenith"
  RMDir /r "$LOCALAPPDATA\Zenith"
  RMDir /r "$PROFILE\.zenith-launcher"
  RMDir /r "$PROFILE\.zenith-minecraft"
  RMDir /r "$PROFILE\zenith-logs"
  ; 清理临时文件
  RMDir /r "$TEMP\zenith-launcher-args"
!macroend
