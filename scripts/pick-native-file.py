from pywinauto import Application
import sys
import time


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: pick-native-file.py <absolute-file-path>")
        return 2

    file_path = sys.argv[1]
    deadline = time.time() + 20
    last_error = None

    while time.time() < deadline:
        try:
            app = Application(backend="uia").connect(title_re=r"^(Open|Select|Choose).*|^Open$", timeout=2)
            dialog = app.window(title_re=r"^(Open|Select|Choose).*|^Open$")
            dialog.wait("visible ready", timeout=3)
            edit = dialog.child_window(control_type="Edit").wrapper_object()
            edit.set_edit_text(file_path)
            open_button = dialog.child_window(title_re=r"^(Open|OK)$", control_type="Button").wrapper_object()
            open_button.click()
            print("dialog-submitted")
            return 0
        except Exception as exc:
            last_error = exc
            time.sleep(0.5)

    print(f"dialog-failed: {last_error}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())