with open(r"C:\Users\giorg\.gemini\antigravity\scratch\Zaylo\zaylo-remote\blind-device.js", "r", encoding="utf-8") as f:
    for line_no, line in enumerate(f, 1):
        if "setting-item" in line or "publishConfig" in line or "twtEnabled" in line:
            print(f"Line {line_no}: {line.strip()}")
