"""Private adapter bridge. Files and protocol are owned by the TS adapter."""
import contextlib
import io
import json
import os
import sys


def main():
    if sys.argv[1:] == ["--check"]:
        with contextlib.redirect_stdout(sys.stderr):
            from rembg import new_session, remove
        print(json.dumps({"ready": True}))
        return
    request = json.load(sys.stdin)
    # Explicit cache location: never use the user's global model directory.
    os.environ["U2NET_HOME"] = request["models"]
    os.environ["REMBG_HOME"] = request["models"]
    with contextlib.redirect_stdout(sys.stderr):
        from rembg import new_session, remove
        from PIL import Image, ImageChops
        session = new_session(request["session"], providers=["CPUExecutionProvider"])
        source = Image.open(request["input"]).convert("RGBA")
        # One inference produces the reusable mask. Preserve existing alpha.
        mask = remove(source, session=session, only_mask=True,
                      post_process_mask=request["params"]["postProcessMask"]).convert("L")
        if mask.size != source.size:
            raise ValueError("Model returned an incompatible mask size")
        source.putalpha(ImageChops.multiply(source.getchannel("A"), mask))
        source.save(request["output"], format="PNG")
        mask.save(request["mask"], format="PNG")
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
