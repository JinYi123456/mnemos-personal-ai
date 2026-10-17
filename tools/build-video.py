#!/usr/bin/env python3
"""
Assemble the Mnemos demo film from real captured frames + SAPI5 narration.

Design: the edit is cut to the *voice*. Each shot lasts exactly its narration
plus a short tail; overlays are time-gated; one global subtitle track is burned
in the final pass. All ffmpeg runs with cwd = assets/video so every path in a
filtergraph is relative (no Windows colon-escaping). Zero network, zero cost.

  python tools/build-video.py            # full build -> assets/video/mnemos-demo.mp4
  STAGE=segments python tools/build-video.py
  STAGE=concat|subs|audio|final python tools/build-video.py
"""
import json, os, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VDIR = os.path.join(ROOT, "assets", "video")
AUDIO = os.path.join(VDIR, "audio")
PAD = 0.8           # silent tail after each VO
FPS = 30
STAGE = os.environ.get("STAGE", "all")

# Python's inherited PATH may not carry the WinGet ffmpeg dir the shell sees.
_FFBIN = shutil.which("ffmpeg") or os.path.join(
    os.path.expanduser("~"),
    "AppData/Local/Microsoft/WinGet/Packages/"
    "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.1-full_build/bin")
FFMPEG = _FFBIN if os.path.isfile(_FFBIN) else os.path.join(_FFBIN, "ffmpeg.exe")
FFPROBE = os.path.join(os.path.dirname(FFMPEG), "ffprobe.exe")

# ---- fonts: copy locally so libass + drawtext can find them -----------------
FONTS = os.path.join(VDIR, "fonts")
os.makedirs(FONTS, exist_ok=True)
for f in ("segoeui.ttf", "segoeui-bold.ttf", "consola.ttf", "segoeui-light.ttf"):
    dst = os.path.join(FONTS, f)
    if not os.path.exists(dst):
        src = os.path.join("C:/Windows/Fonts", f)
        if os.path.exists(src):
            shutil.copy(src, dst)
SANS = "fonts/segoeui.ttf"
BOLD = "fonts/segoeui-bold.ttf" if os.path.exists(os.path.join(FONTS, "segoeui-bold.ttf")) else SANS
MONO = "fonts/consola.ttf" if os.path.exists(os.path.join(FONTS, "consola.ttf")) else SANS

def run(args, desc):
    print("  $", " ".join(args[:6]), "…")
    r = subprocess.run(args, cwd=VDIR, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout[-2000:]); print(r.stderr[-3000:])
        raise SystemExit(f"ffmpeg failed: {desc}")
    return r

def load_timings():
    with open(os.path.join(AUDIO, "timings.json"), encoding="utf-8") as fh:
        return {t["id"]: t["dur"] for t in json.load(fh)["timings"]}

def esc(text):
    # escape drawtext text: backslash, colon, single-quote, percent
    return text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'").replace("%", "\\%")

def badge(text, x="w-tw-46", y="46", size=30, color="0xF2C87A", font=None, t0=0.0, t1=None):
    font = font or BOLD
    en = f":enable='between(t,{t0},{t1 if t1 is not None else 9999})'"
    return (f"drawtext=fontfile={font}:text='{esc(text)}':fontcolor={color}:fontsize={size}:"
            f"x={x}:y={y}:box=1:boxcolor=black@0.38:boxborderw=14:line_spacing=6{en}")

def reveal(text, x, y, size=54, color="white", font=None, t0=0.0, t1=None, alpha=True):
    font = font or BOLD
    a = f":alpha='if(lt(t,{t0}),0,if(lt(t,{t0}+0.5),(t-{t0})/0.5,1))'" if alpha else ""
    en = f":enable='between(t,{t0},{t1})'" if t1 is not None else f":enable='gte(t,{t0})'"
    return (f"drawtext=fontfile={font}:text='{esc(text)}':fontcolor={color}:fontsize={size}:"
            f"x={x}:y={y}{a}{en}")

def lower(text, size=40, color="white", t0=0.0, t1=None):
    en = f":enable='between(t,{t0},{t1 if t1 is not None else 9999})'"
    return (f"drawtext=fontfile={SANS}:text='{esc(text)}':fontcolor={color}:fontsize={size}"
            f":x=(w-text_w)/2:y=h-150:box=1:boxcolor=black@0.45:boxborderw=16{en}")

# ---- shot spec ---------------------------------------------------------------
def build_shots(timings):
    def d(vo): return round(timings[vo] + PAD, 2)
    T = timings
    shots = [
        dict(id="01-sky", dur=d("sky"), kind="loop", src="s01-sky", srcfps=3, filters=[
            reveal("FORGET", "(w-text_w)/2", "h*0.34", 64, "0xB9C4E8", t0=4.5, t1=8.3),
            reveal("HIDDEN", "(w-text_w)/2", "h*0.34", 64, "0xB9C4E8", t0=8.8, t1=12.6),
            reveal("UNVERIFIABLE", "(w-text_w)/2", "h*0.34", 64, "0xB9C4E8", t0=13.1, t1=17.5),
        ]),
        dict(id="02-recall", dur=d("recall"), kind="still", src="s02-recall-still.png", filters=[
            badge("WATCH IT THINK", t0=0.4, t1=T["recall"]+0.4),
            reveal("every claim carries a memory id", "46", "h*0.5", 40, "0xE8D9A0", font=SANS, t0=6.0),
        ]),
        dict(id="03-telemetry", dur=d("telemetry"), kind="still", src="s03-telemetry.png", filters=[
            badge("METERED LIVE", t0=0.4, t1=T["telemetry"]+0.4),
            lower("Nebius Token Factory · NVIDIA Nemotron 3", t0=1.0, t1=T["telemetry"]+0.4),
        ]),
        dict(id="04-tavily", dur=d("tavily"), kind="still", src="s04-tavily-still.png", filters=[
            badge("TOOL · web_search", t0=0.4, t1=T["tavily"]+0.4),
        ]),
        dict(id="05-ablation", dur=d("ablation"), kind="still", src="s05-ablation-still.png", filters=[
            badge("TEST IT", t0=0.4, t1=T["ablation"]+0.4),
            reveal("What if it forgot this?", "(w-text_w)/2", "h*0.16", 58, "0xF2C87A", t0=3.0),
            reveal("97 percent of the answer rewritten", "(w-text_w)/2", "h*0.235", 44, "white", font=SANS, t0=12.0),
            reveal("similarity 3 percent", "(w-text_w)/2 - 320", "h*0.30", 40, "0x8FE3C0", font=MONO, t0=15.0),
            reveal("citations 3 to 0", "(w-text_w)/2 + 320", "h*0.30", 40, "0xE88A8A", font=MONO, t0=16.5),
            reveal("LOAD-BEARING MEMORY", "(w-text_w)/2", "h*0.365", 46, "0xF2C87A", t0=19.0),
        ]),
        dict(id="06-dream", dur=d("dream"), kind="clip", src="s06-dream", srcfps=2, filters=[
            badge("IT DREAMS ON PURPOSE", t0=0.4, t1=T["dream"]+0.4),
            reveal("Nemotron 3 Ultra", "46", "h*0.86", 34, "0xB9C4E8", font=SANS, t0=5.0),
        ]),
        dict(id="07-brief", dur=d("brief"), kind="still", src="s07-brief.png", filters=[
            badge("MORNING BRIEF", t0=0.3, t1=T["brief"]+0.3),
        ]),
        dict(id="08-photo", dur=d("photo"), kind="still", src="s08-photo-still.png", filters=[
            badge("NVIDIA VISION", t0=0.3, t1=T["photo"]+0.3),
            reveal("Nemotron-3.5-Super-VL", "(w-text_w)/2", "h*0.9", 32, "0x8FE3C0", font=MONO, t0=1.2),
        ]),
        dict(id="09-evidence", dur=d("evidence"), kind="montage", parts=[
            dict(src="s09-shapes-still.png", kind="still", secs=5.0, cap="the agent reshapes its own sky"),
            dict(src="s10-json.png", kind="still", secs=4.0, cap="one vault per visitor · plain JSON"),
            dict(src="s11-mcp.png", kind="still", secs=4.4, cap="zero-dependency MCP server"),
            dict(src="s12-bench.png", kind="still", secs=round(T["evidence"]+PAD-13.4, 2), cap="retrieval measured · 40 questions · 4 modes"),
        ]),
        dict(id="10-title", dur=round(T["title"] + 1.4, 2), kind="card", src="title.png"),
    ]
    return shots

# ---- stage: build each segment (video only, 30fps, 1920x1080) ---------------
def stage_segments(shots):
    os.makedirs(os.path.join(VDIR, "seg"), exist_ok=True)
    for s in shots:
        out = f"seg/{s['id']}.mp4"
        vf = ["scale=1920:1080:force_original_aspect_ratio=decrease",
              "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x080a14", "setsar=1", f"fps={FPS}"]
        base = []
        if s["kind"] in ("clip", "loop"):
            # two passes: (1) real frames -> full-length base (freeze last frame to VO length),
            # (2) overlays onto that base. Doing tpad and many drawtext in one graph is fragile.
            nframes = len(os.listdir(os.path.join(VDIR, s["src"])))
            if s["kind"] == "clip":
                # play the whole captured action across ~55% of the shot, then hold the result
                srcfps = min(30, max(1, round(nframes / (s["dur"] * 0.55))))
            else:
                srcfps = s["srcfps"]
            pad = max(0.0, s["dur"] - (nframes / srcfps)) if s["kind"] == "clip" else 0.0
            bvf = ["scale=1920:1080", "setsar=1", f"fps={FPS}"]
            if s["kind"] == "clip":
                bvf.append(f"tpad=stop_mode=clone:stop_duration={pad:.2f}")
            if s["id"] == "01-sky":
                bvf.append("fade=t=in:st=0:d=0.8")
            base_in = (["-stream_loop", "-1"] if s["kind"] == "loop" else []) + \
                      ["-framerate", str(srcfps), "-i", f"{s['src']}/%04d.jpg"]
            run([FFMPEG] + base_in + ["-vf", ",".join(bvf), "-t", f'{s["dur"]}',
                     "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
                     f"seg/{s['id']}-base.mp4"], f"base {s['id']}")
            ov = s.get("filters", [])
            if ov:
                run([FFMPEG, "-y", "-i", f"seg/{s['id']}-base.mp4", "-vf", ",".join(ov),
                     "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
                     out], f"overlay {s['id']}")
            else:
                shutil.move(os.path.join(VDIR, f"seg/{s['id']}-base.mp4"), os.path.join(VDIR, out))
            continue
        elif s["kind"] == "still":
            base = ["-loop", "1", "-t", f'{s["dur"]}', "-i", s["src"]]
        elif s["kind"] == "card":
            base = ["-loop", "1", "-t", f'{s["dur"]}', "-i", s["src"]]
        elif s["kind"] == "montage":
            subs = []
            for i, p in enumerate(s["parts"]):
                po = f"seg/{s['id']}-p{i}.mp4"
                cap = f"drawtext=fontfile={SANS}:text='{esc(p['cap'])}':fontcolor=white:fontsize=34:x=46:y=h-120:box=1:boxcolor=black@0.45:boxborderw=14:enable='gte(t,0.2)'"
                if p["kind"] == "clip":
                    n = len(os.listdir(os.path.join(VDIR, p["src"])))
                    sfps = min(30, max(1, round(n / (p["secs"] * 0.6))))
                    hold = max(0.0, p["secs"] - n / sfps)
                    run([FFMPEG, "-y", "-framerate", str(sfps), "-i", f"{p['src']}/%04d.jpg",
                         "-vf", ",".join(["scale=1920:1080", "setsar=1", f"fps={FPS}",
                                          f"tpad=stop_mode=clone:stop_duration={hold:.2f}", cap]),
                         "-t", f"{p['secs']}", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                         "-pix_fmt", "yuv420p", po], f"montage part {i}")
                else:
                    run([FFMPEG, "-y", "-loop", "1", "-t", f"{p['secs']}", "-i", p["src"],
                         "-vf", ",".join(["scale=1920:1080", "setsar=1", f"fps={FPS}", cap]),
                         "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", po],
                        f"montage part {i}")
                subs.append(po)
            with open(os.path.join(VDIR, f"{s['id']}-list.txt"), "w") as fh:
                for pth in subs: fh.write(f"file '{pth}'\n")
            run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", f"{s['id']}-list.txt",
                 "-c", "copy", out], f"montage concat {s['id']}")
            continue
        vf += s.get("filters", [])
        if s["id"] == "01-sky":
            vf.append("fade=t=in:st=0:d=0.8")
        run([FFMPEG] + base + ["-vf", ",".join(vf), "-t", f'{s["dur"]}',
                    "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                    "-pix_fmt", "yuv420p", "-r", str(FPS), out],
            f"segment {s['id']}")
    print("segments done")

def stage_concat(shots):
    with open(os.path.join(VDIR, "seglst.txt"), "w") as fh:
        for s in shots: fh.write(f"file 'seg/{s['id']}.mp4'\n")
    run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", "seglst.txt",
         "-c", "copy", "video_silent.mp4"], "concat")
    print("concat done")

# ---- subtitles: split each VO into cues across its segment ------------------
def split_cues(text, dur):
    import re
    sents = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if s.strip()]
    chunks = []
    for s in sents:
        words = s.split()
        cur = []
        for w in words:
            cur.append(w)
            if len(" ".join(cur)) >= 62:
                chunks.append(" ".join(cur)); cur = []
        if cur: chunks.append(" ".join(cur))
    total_chars = sum(len(c) for c in chunks) or 1
    out, t = [], 0.0
    for c in chunks:
        seg_len = round(dur * len(c) / total_chars, 3)
        out.append((t, t + seg_len, c)); t += seg_len
    return out

def srt_ts(t):
    h = int(t // 3600); m = int((t % 3600) // 60); s = t % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")

def stage_subs(shots, narr):
    with open(os.path.join(VDIR, "subs.srt"), "w", encoding="utf-8") as fh:
        idx = 1; start = 0.0
        for s in shots:
            vo = s["id"].split("-", 1)[1]
            text = narr.get(vo, "")
            if not text or vo == "title":   # end card already shows its own text
                start += s["dur"]; continue
            for a, b, c in split_cues(text, s["dur"]):
                fh.write(f"{idx}\n{srt_ts(start+a)} --> {srt_ts(start+b)}\n{c}\n\n"); idx += 1
            start += s["dur"]
    print("subs done")

# ---- audio: pad each VO to its segment, concat, two-pass loudnorm -----------
def stage_audio(shots):
    os.makedirs(os.path.join(VDIR, "aud"), exist_ok=True)
    lst = []
    for s in shots:
        vo = s["id"].split("-", 1)[1]
        wav = f"audio/{vo}.wav"
        out = f"aud/{s['id']}.wav"
        if os.path.exists(os.path.join(VDIR, wav)):
            run([FFMPEG, "-y", "-i", wav, "-af",
                 "aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo,apad",
                 "-t", f'{s["dur"]}', out], f"pad {vo}")
        else:
            run([FFMPEG, "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
                 "-t", f'{s["dur"]}', out], f"silence {vo}")
        lst.append(out)
    with open(os.path.join(VDIR, "audlst.txt"), "w") as fh:
        for p in lst: fh.write(f"file '{p}'\n")
    run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", "audlst.txt",
         "-c", "pcm_s16le", "voice_raw.wav"], "concat audio")
    # two-pass loudnorm
    import re
    p1 = subprocess.run([FFMPEG, "-i", "voice_raw.wav", "-af",
                         "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
                        cwd=VDIR, capture_output=True, text=True)
    m = re.search(r"\{[^}]*\}", p1.stderr)
    j = json.loads(m.group(0)) if m else {}
    meas = ":".join([
        f"measured_I={j.get('input_i', -24)}", f"measured_TP={j.get('input_tp', -6)}",
        f"measured_LRA={j.get('input_lra', 6)}", f"measured_thresh={j.get('input_thresh', -34)}",
        f"offset={j.get('target_offset', 0)}", "linear=true",
    ])
    run([FFMPEG, "-y", "-i", "voice_raw.wav", "-af",
         f"loudnorm=I=-16:TP=-1.5:LRA=11:{meas}",
         "-ar", "48000", "-c:a", "pcm_s16le", "voice_norm.wav"], "loudnorm pass2")
    print("audio done")

def stage_final(shots):
    total = round(sum(s["dur"] for s in shots), 2)
    style = ("FontName=Segoe UI,FontSize=20,PrimaryColour=&H00FFFFFF,"
             "OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,"
             "Alignment=2,MarginV=44")
    run([FFMPEG, "-y", "-i", "video_silent.mp4", "-i", "voice_norm.wav",
         "-vf", f"subtitles=subs.srt:fontsdir=fonts:force_style='{style}'",
         "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
         "-movflags", "+faststart", "-shortest", "mnemos-demo.mp4"], "final mux+subs")
    print(f"FINAL: assets/video/mnemos-demo.mp4  (~{total:.0f}s)")

def main():
    timings = load_timings()
    with open(os.path.join(AUDIO, "_map.json"), encoding="utf-8") as fh:
        narr = {s["id"]: s["text"] for s in json.load(fh)}
    shots = build_shots(timings)
    if STAGE in ("all", "segments"): stage_segments(shots)
    if STAGE in ("all", "concat"): stage_concat(shots)
    if STAGE in ("all", "subs"): stage_subs(shots, narr)
    if STAGE in ("all", "audio"): stage_audio(shots)
    if STAGE in ("all", "final"): stage_final(shots)

if __name__ == "__main__":
    main()
