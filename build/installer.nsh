!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
  Var LanguageDialog
  Var LanguageDropdown
  Var LauncherLanguage

  !macro customPageAfterChangeDir
    Page custom LauncherLanguagePageCreate LauncherLanguagePageLeave
  !macroend

  Function LauncherLanguagePageCreate
    nsDialogs::Create 1018
    Pop $LanguageDialog
    ${If} $LanguageDialog == error
      Abort
    ${EndIf}

    ${If} $LANGUAGE == 1033
      ${NSD_CreateLabel} 0 0 100% 20u "Which language should NEXIUM use?"
    ${Else}
      ${NSD_CreateLabel} 0 0 100% 20u "Какой язык использовать в лаунчере?"
    ${EndIf}
    Pop $0

    ${NSD_CreateDropList} 0 28u 100% 100u ""
    Pop $LanguageDropdown
    ${NSD_CB_AddString} $LanguageDropdown "Русский"
    ${NSD_CB_AddString} $LanguageDropdown "English"

    ${If} $LANGUAGE == 1033
      SendMessage $LanguageDropdown ${CB_SETCURSEL} 1 0
    ${Else}
      SendMessage $LanguageDropdown ${CB_SETCURSEL} 0 0
    ${EndIf}

    nsDialogs::Show
  FunctionEnd

  Function LauncherLanguagePageLeave
    ${NSD_GetText} $LanguageDropdown $0
    ${If} $0 == "English"
      StrCpy $LauncherLanguage "en"
    ${Else}
      StrCpy $LauncherLanguage "ru"
    ${EndIf}
  FunctionEnd
!endif

!macro customInstall
  CreateDirectory "$APPDATA\NEXIUM Launcher"
  FileOpen $0 "$APPDATA\NEXIUM Launcher\installer-language.txt" w
  IfErrors languageFileError
  FileWrite $0 "$LauncherLanguage$\r$\n"
  FileClose $0
  Goto languageFileDone

  languageFileError:
    IfSilent languageFileSilentError
    MessageBox MB_ICONSTOP "Не удалось сохранить выбранный язык. Проверьте права доступа к папке настроек."
  languageFileSilentError:
    Abort

  languageFileDone:
!macroend
