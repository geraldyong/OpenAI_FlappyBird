from PIL import Image, ImageDraw, ImageFont

def create_static_icon(emoji, name, size=64):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("AppleColorEmoji.ttc", size - 10)
    except:
        font = ImageFont.load_default()
    draw.text((size//5, size//5), emoji, font=font, fill="black")
    img.save(f"{name}.png")
    print(f"Saved: {name}.png")

create_static_icon("❤️", "heart")
create_static_icon("💎", "diamond_blue")
create_static_icon("💎", "diamond_green")
create_static_icon("💎", "diamond_red")
create_static_icon("😇", "angel")
create_static_icon("🔄", "disc")
create_static_icon("🐢", "tortoise")
