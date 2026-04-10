"use client";

const PARTY_SPRITES = [
  "/sprites/male/mametchi.png",
  "/sprites/female/lovelitchi.png",
  "/sprites/male/kuchipatchi.png",
  "/sprites/female/momotchi.png",
  "/sprites/male/kuromametchi.png",
  "/sprites/female/violetchi.png",
  "/sprites/female/memetchi.png",
  "/sprites/male/kikitchi.png",
  "/sprites/female/chamametchi.png",
  "/sprites/male/gozarutchi.png",
];

type RoutineItem = {
  id: string;
  name: string;
  sort_order: number;
};

export default function RoutineParty({
  items,
  checkedIds,
}: {
  items: RoutineItem[];
  checkedIds: Set<string>;
}) {
  return (
    <div
      className="relative rounded-2xl overflow-hidden border border-gray-100"
      style={{ background: "white", height: 110 }}
    >
      {/* Frame overlay */}
      <img
        src="/frame001.png"
        alt=""
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "fill",
          zIndex: 1,
          pointerEvents: "none",
        }}
      />
      {/* Content */}
      <div
        className="flex items-center justify-around h-full px-2"
        style={{ position: "relative", zIndex: 2 }}
      >
        {items.map((item, i) => {
          const checked = checkedIds.has(item.id);
          const sprite = PARTY_SPRITES[i % PARTY_SPRITES.length];
          return (
            <div key={item.id} className="flex flex-col items-center gap-1">
              <img
                src={sprite}
                alt={item.name}
                style={{
                  width: 52,
                  height: 52,
                  imageRendering: "pixelated",
                  filter: checked ? "none" : "grayscale(100%)",
                  opacity: checked ? 1 : 0.4,
                }}
              />
              <span
                style={{
                  fontSize: 6,
                  whiteSpace: "nowrap",
                  color: checked ? "#000" : "#999",
                }}
              >
                {item.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
