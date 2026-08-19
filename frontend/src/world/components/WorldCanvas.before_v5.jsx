import { useEffect, useRef } from 'react';
import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
} from 'pixi.js';

const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 4200;

const MIN_ZOOM = 0.18;
const MAX_ZOOM = 1.35;

const ASSET = (path) =>
  `/world-assets/royal-village/${path}`;

const ROYAL_ASSETS = {
  grass: ASSET('terrain/grass.png'),
  dirt: ASSET('terrain/dirt.png'),
  stone: ASSET('terrain/stone.png'),
  water1: ASSET('terrain/water-1.png'),
  water2: ASSET('terrain/water-2.png'),
  water3: ASSET('terrain/water-3.png'),
  water4: ASSET('terrain/water-4.png'),
  bridge: ASSET('terrain/bridge.png'),
  gravelBrown: ASSET('terrain/gravel-brown.png'),
  gravelGrey: ASSET('terrain/gravel-grey.png'),
  mud: ASSET('terrain/mud.png'),

  castleWall: ASSET('buildings/castle-wall.png'),
  castleTop: ASSET('buildings/castle-top.png'),
  castleRoof: ASSET('buildings/castle-roof.png'),
  castleGate: ASSET('buildings/castle-gate.png'),
  castleStairs: ASSET('buildings/castle-stairs.png'),
  buildingStone: ASSET('buildings/building-stone.png'),
  buildingFrame: ASSET('buildings/building-frame.png'),
  roofRed: ASSET('buildings/roof-red.png'),
  roofRedPoint: ASSET('buildings/roof-red-point.png'),
  marketRed: ASSET('buildings/market-red.png'),
  marketBlue: ASSET('buildings/market-blue.png'),
  marketRoofRed: ASSET('buildings/market-roof-red.png'),
  marketRoofBlue: ASSET('buildings/market-roof-blue.png'),

  treeGreen: ASSET('nature/tree-green.png'),
  treeOrange: ASSET('nature/tree-orange.png'),
  treeRed: ASSET('nature/tree-red.png'),
  bushSmall: ASSET('nature/bush-small.png'),
  bushLarge: ASSET('nature/bush-large.png'),

  fence: ASSET('props/fence.png'),
  fenceGate: ASSET('props/fence-gate.png'),
  cart: ASSET('props/cart.png'),
  cartHorse: ASSET('props/cart-horse.png'),
  treasure: ASSET('props/treasure.png'),
  box: ASSET('props/box.png'),
  boxWide: ASSET('props/box-wide.png'),
  ladderSmall: ASSET('props/ladder-small.png'),

  man: ASSET('characters/man.png'),
  woman: ASSET('characters/woman.png'),
  horse: ASSET('characters/horse.png'),
  wizard: ASSET('characters/wizard.png'),
};

const LEVEL_POINTS = [
  { level: 1, name: 'Village Gate', x: 760, y: 3650 },
  { level: 2, name: 'Market Square', x: 585, y: 3350 },
  { level: 3, name: 'Royal Farm', x: 850, y: 3090 },
  { level: 4, name: 'Riverside Trail', x: 1040, y: 2810 },
  { level: 5, name: "King's Bridge", x: 790, y: 2490 },
  { level: 6, name: 'Whispering Woods', x: 570, y: 2170 },
  { level: 7, name: 'Ancient Ruins', x: 820, y: 1870 },
  { level: 8, name: 'Watchtower Pass', x: 1010, y: 1540 },
  { level: 9, name: 'Castle Crossing', x: 770, y: 1210 },
  { level: 10, name: 'Royal Gate', x: 650, y: 900 },
];

function textLabel(text, size = 24) {
  const label = new Text({
    text,
    style: {
      fontFamily: 'Georgia, Times New Roman, serif',
      fontSize: size,
      fontWeight: '900',
      fill: 0xffffff,
      stroke: {
        color: 0x2a1b12,
        width: 5,
      },
      align: 'center',
    },
  });

  label.anchor.set(0.5);
  return label;
}

function sprite(texture, x, y, scale = 1) {
  const s = new Sprite(texture);
  s.anchor.set(0.5);
  s.x = x;
  s.y = y;
  s.scale.set(scale);
  return s;
}

function createLevelMarker(level, name, x, y) {
  const root = new Container();

  root.x = x;
  root.y = y;

  // Keep labels toward the centre of the journey.
  // Left-side destinations place their name to the right,
  // right-side destinations place their name to the left.
  let boardOffsetX = 0;

  if (x < 690) {
    boardOffsetX = 105;
  } else if (x > 910) {
    boardOffsetX = -105;
  }

  const shadow = new Graphics();

  shadow.ellipse(
    0,
    13,
    38,
    15,
  );

  shadow.fill({
    color: 0x000000,
    alpha: 0.22,
  });

  const glow = new Graphics();

  glow.circle(
    0,
    0,
    38,
  );

  glow.fill({
    color: 0xe7bd55,
    alpha: 0.14,
  });

  const outer = new Graphics();

  outer.circle(
    0,
    0,
    31,
  );

  outer.fill(
    0xe0bb58,
  );

  outer.stroke({
    width: 4,
    color: 0xffe8a3,
  });

  const inner = new Graphics();

  inner.circle(
    0,
    0,
    24,
  );

  inner.fill(
    0x352219,
  );

  const number = textLabel(
    String(level),
    17,
  );

  number.y = -1;

  const board = new Graphics();

  board.roundRect(
    -74,
    -19,
    148,
    38,
    10,
  );

  board.fill({
    color: 0x302018,
    alpha: 0.94,
  });

  board.stroke({
    width: 2,
    color: 0xc99c42,
  });

  board.x = boardOffsetX;
  board.y = 58;

  const destination =
    textLabel(
      name,
      11,
    );

  destination.x =
    boardOffsetX;

  destination.y = 58;

  root.addChild(
    shadow,
    glow,
    outer,
    inner,
    number,
    board,
    destination,
  );

  root.__levelNumber = level;
  root.__glow = glow;

  return root;
}

function createArena(textureMap) {
  const arena = new Container();

  const base = new Graphics();
  base.roundRect(-190, -80, 380, 145, 24);
  base.fill({
    color: 0x4b3426,
    alpha: 0.95,
  });

  const wallLeft = sprite(
    textureMap.castleWall,
    -115,
    -70,
    1.35,
  );

  const wallRight = sprite(
    textureMap.castleWall,
    115,
    -70,
    1.35,
  );

  const gate = sprite(
    textureMap.castleGate,
    0,
    -55,
    1.45,
  );

  const topLeft = sprite(
    textureMap.castleTop,
    -115,
    -155,
    1.35,
  );

  const topRight = sprite(
    textureMap.castleTop,
    115,
    -155,
    1.35,
  );

  const board = new Graphics();
  board.roundRect(
    -175,
    -285,
    350,
    94,
    20,
  );
  board.fill(0x2f2018);
  board.stroke({
    width: 6,
    color: 0xd6ad45,
  });

  const title = textLabel(
    'CHAMPION ARENA I',
    22,
  );
  title.y = -255;

  const prize = textLabel(
    '£100 CHAMPION PRIZE',
    30,
  );
  prize.y = -218;

  arena.addChild(
    base,
    wallLeft,
    wallRight,
    gate,
    topLeft,
    topRight,
    board,
    title,
    prize,
  );

  arena.__board = board;
  return arena;
}

function createVillageHouse(textureMap, x, y, scale = 1) {
  const house = new Container();
  house.x = x;
  house.y = y;
  house.scale.set(scale);

  const shadow = new Graphics();
  shadow.ellipse(0, 16, 56, 18);
  shadow.fill({
    color: 0x000000,
    alpha: 0.17,
  });

  const stone = sprite(
    textureMap.buildingStone,
    0,
    -28,
    1,
  );

  const frame = sprite(
    textureMap.buildingFrame,
    0,
    -76,
    1,
  );

  const roof = sprite(
    textureMap.roofRed,
    0,
    -126,
    1,
  );

  house.addChild(
    shadow,
    stone,
    frame,
    roof,
  );

  return house;
}

function createPath() {
  const path = new Graphics();

  path.moveTo(
    LEVEL_POINTS[0].x,
    WORLD_HEIGHT,
  );

  LEVEL_POINTS.forEach(
    (point, index) => {
      const prev =
        index === 0
          ? {
              x: LEVEL_POINTS[0].x,
              y: WORLD_HEIGHT,
            }
          : LEVEL_POINTS[index - 1];

      const midY =
        (prev.y + point.y) / 2;

      path.bezierCurveTo(
        prev.x,
        midY,
        point.x,
        midY,
        point.x,
        point.y,
      );
    },
  );

  path.bezierCurveTo(
    650,
    700,
    800,
    620,
    800,
    500,
  );

  path.stroke({
    width: 88,
    color: 0xa77c4e,
  });

  const centre = new Graphics();

  centre.moveTo(
    LEVEL_POINTS[0].x,
    WORLD_HEIGHT,
  );

  LEVEL_POINTS.forEach(
    (point, index) => {
      const prev =
        index === 0
          ? {
              x: LEVEL_POINTS[0].x,
              y: WORLD_HEIGHT,
            }
          : LEVEL_POINTS[index - 1];

      const midY =
        (prev.y + point.y) / 2;

      centre.bezierCurveTo(
        prev.x,
        midY,
        point.x,
        midY,
        point.x,
        point.y,
      );
    },
  );

  centre.bezierCurveTo(
    650,
    700,
    800,
    620,
    800,
    500,
  );

  centre.stroke({
    width: 14,
    color: 0xdabf87,
    alpha: 0.7,
  });

  return {
    path,
    centre,
  };
}

export default function WorldCanvas() {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) return undefined;

    let app = null;
    let initialized = false;
    let destroyed = false;

    let camera = null;
    let zoom = 0.62;

    let dragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let cameraStartX = 0;
    let cameraStartY = 0;

    const activePointers = new Map();

    let pinchStartDistance = null;
    let pinchStartZoom = null;

    const animatedWater = [];
    const animatedTrees = [];

    let arena = null;
    let player = null;

    let entranceAnimation = null;

    const clampCamera = () => {
      if (!app || !camera) return;

      const width = app.renderer.width;
      const height = app.renderer.height;

      const scaledWidth =
        WORLD_WIDTH * zoom;

      const scaledHeight =
        WORLD_HEIGHT * zoom;

      camera.x = Math.min(
        80,
        Math.max(
          width - scaledWidth - 80,
          camera.x,
        ),
      );

      camera.y = Math.min(
        80,
        Math.max(
          height - scaledHeight - 80,
          camera.y,
        ),
      );
    };

    const focusPoint = (
      worldX,
      worldY,
      targetZoom,
    ) => {
      if (!app || !camera) return;

      zoom = Math.max(
        MIN_ZOOM,
        Math.min(
          MAX_ZOOM,
          targetZoom,
        ),
      );

      camera.scale.set(zoom);

      camera.x =
        app.renderer.width / 2 -
        worldX * zoom;

      camera.y =
        app.renderer.height / 2 -
        worldY * zoom;

      clampCamera();
    };

    const focusStart = () => {
      const mobile =
        app.renderer.width <= 760;

      focusPoint(
        760,
        3490,
        mobile ? 0.98 : 0.68,
      );
    };

    const fitChapter = () => {
      if (!app || !camera) return;

      zoom = Math.min(
        app.renderer.width /
          WORLD_WIDTH,
        app.renderer.height /
          WORLD_HEIGHT,
      ) * 0.92;

      zoom = Math.max(
        MIN_ZOOM,
        zoom,
      );

      camera.scale.set(zoom);

      camera.x =
        (
          app.renderer.width -
          WORLD_WIDTH * zoom
        ) / 2;

      camera.y =
        (
          app.renderer.height -
          WORLD_HEIGHT * zoom
        ) / 2;

      clampCamera();
    };

    const applyZoom = (
      nextZoom,
      pointerX,
      pointerY,
    ) => {
      const oldZoom = zoom;

      zoom = Math.max(
        MIN_ZOOM,
        Math.min(
          MAX_ZOOM,
          nextZoom,
        ),
      );

      const worldX =
        (pointerX - camera.x) /
        oldZoom;

      const worldY =
        (pointerY - camera.y) /
        oldZoom;

      camera.scale.set(zoom);

      camera.x =
        pointerX -
        worldX * zoom;

      camera.y =
        pointerY -
        worldY * zoom;

      clampCamera();
    };

    const start = async () => {
      app = new Application();

      await app.init({
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(
          window.devicePixelRatio || 1,
          2,
        ),
        resizeTo: host,
        preference: 'webgl',
      });

      initialized = true;

      if (destroyed) {
        app.destroy(true, {
          children: true,
        });

        return;
      }

      app.canvas.className =
        'pl-world-canvas';

      host.appendChild(app.canvas);

      const textures = {};

      await Promise.all(
        Object.entries(
          ROYAL_ASSETS,
        ).map(
          async ([key, url]) => {
            textures[key] =
              await Assets.load(url);
          },
        ),
      );

      if (destroyed) return;

      camera = new Container();
      app.stage.addChild(camera);

      const background = new Graphics();
      background.rect(
        0,
        0,
        WORLD_WIDTH,
        WORLD_HEIGHT,
      );
      background.fill(0x86b968);

      camera.addChild(background);

      // Organic countryside base.
      // Do NOT repeat tileGrass across the whole world:
      // its visible tile edge created the striped prototype look.
      const meadow = new Graphics();

      meadow.rect(
        0,
        0,
        WORLD_WIDTH,
        WORLD_HEIGHT,
      );

      meadow.fill(0x70a957);

      const meadowLight = new Graphics();

      meadowLight.ellipse(
        430,
        3450,
        510,
        650,
      );

      meadowLight.ellipse(
        1110,
        2900,
        500,
        720,
      );

      meadowLight.ellipse(
        480,
        1850,
        480,
        700,
      );

      meadowLight.ellipse(
        1100,
        1150,
        450,
        650,
      );

      meadowLight.fill({
        color: 0x91c66c,
        alpha: 0.36,
      });

      const meadowDark = new Graphics();

      meadowDark.ellipse(
        120,
        2500,
        420,
        850,
      );

      meadowDark.ellipse(
        1490,
        1700,
        430,
        980,
      );

      meadowDark.fill({
        color: 0x416f3e,
        alpha: 0.26,
      });

      camera.addChild(
        meadow,
        meadowLight,
        meadowDark,
      );

      // Irregular ground details break up large empty areas.
      const groundDetails = [];

      for (let i = 0; i < 34; i += 1) {
        const texture =
          i % 3 === 0
            ? textures.gravelBrown
            : i % 3 === 1
              ? textures.gravelGrey
              : textures.mud;

        const x =
          110 +
          ((i * 337) % 1360);

        const y =
          520 +
          ((i * 487) % 3300);

        const detail = sprite(
          texture,
          x,
          y,
          0.42 + (i % 4) * 0.08,
        );

        detail.alpha =
          0.16 + (i % 3) * 0.05;

        detail.rotation =
          (i % 5) * 0.35;

        groundDetails.push(detail);
      }

      groundDetails.forEach(
        (detail) =>
          camera.addChild(detail),
      );

      const path = createPath();

      camera.addChild(
        path.path,
        path.centre,
      );

      // River cutting across chapter
      const riverY = 2630;

      const riverBed = new Graphics();

      riverBed.moveTo(
        0,
        riverY - 82,
      );

      riverBed.bezierCurveTo(
        350,
        riverY - 130,
        650,
        riverY - 55,
        900,
        riverY - 90,
      );

      riverBed.bezierCurveTo(
        1150,
        riverY - 125,
        1350,
        riverY - 45,
        WORLD_WIDTH,
        riverY - 88,
      );

      riverBed.lineTo(
        WORLD_WIDTH,
        riverY + 90,
      );

      riverBed.bezierCurveTo(
        1250,
        riverY + 135,
        1000,
        riverY + 65,
        730,
        riverY + 110,
      );

      riverBed.bezierCurveTo(
        430,
        riverY + 150,
        220,
        riverY + 70,
        0,
        riverY + 115,
      );

      riverBed.closePath();

      riverBed.fill(0x3994b3);

      camera.addChild(riverBed);

      for (
        let x = -30;
        x <= WORLD_WIDTH + 60;
        x += 120
      ) {
        const textureSequence = [
          textures.water1,
          textures.water2,
          textures.water3,
          textures.water4,
        ];

        const water = sprite(
          textureSequence[
            Math.floor(
              x / 120,
            ) % 4 < 0
              ? 0
              : Math.floor(
                  x / 120,
                ) % 4
          ],
          x,
          riverY +
            Math.sin(
              x / 170,
            ) *
              24,
          1.18,
        );

        animatedWater.push(
          water,
        );

        camera.addChild(water);
      }

      // Bridge
      for (
        let i = -1;
        i <= 1;
        i += 1
      ) {
        const bridge = sprite(
          textures.bridge,
          790 + i * 105,
          riverY - 5,
          1.05,
        );

        bridge.rotation =
          Math.PI / 2;

        camera.addChild(
          bridge,
        );
      }

      // Village zone
      [
        [330, 3490, 1.05],
        [1110, 3450, 1.0],
        [330, 3200, 0.92],
        [1130, 3060, 0.95],
        [365, 2860, 0.9],
      ].forEach(
        ([x, y, scale]) => {
          camera.addChild(
            createVillageHouse(
              textures,
              x,
              y,
              scale,
            ),
          );
        },
      );

      const market = sprite(
        textures.marketRed,
        1170,
        3290,
        1.1,
      );
      camera.addChild(market);

      const cart = sprite(
        textures.cartHorse,
        420,
        3680,
        0.95,
      );

      camera.addChild(cart);

      // Royal Village marketplace and roadside props.
      [
        [1040, 3550, textures.marketRed, 1.05],
        [1180, 3390, textures.marketBlue, 0.95],
      ].forEach(
        ([x, y, texture, scale]) => {
          camera.addChild(
            sprite(
              texture,
              x,
              y,
              scale,
            ),
          );
        },
      );

      [
        [1010, 3630, textures.box, 0.55],
        [1080, 3650, textures.boxWide, 0.55],
        [370, 3370, textures.treasure, 0.55],
        [1220, 3150, textures.box, 0.5],
      ].forEach(
        ([x, y, texture, scale]) => {
          camera.addChild(
            sprite(
              texture,
              x,
              y,
              scale,
            ),
          );
        },
      );

      // Fences make the village feel inhabited rather than empty.
      for (let i = 0; i < 7; i += 1) {
        camera.addChild(
          sprite(
            textures.fence,
            245 + i * 72,
            3270,
            0.72,
          ),
        );
      }

      for (let i = 0; i < 6; i += 1) {
        camera.addChild(
          sprite(
            textures.fence,
            1050 + i * 62,
            2990,
            0.66,
          ),
        );
      }

      // Forest and decorative areas
      const treePositions = [];

      for (
        let i = 0;
        i < 68;
        i += 1
      ) {
        const side =
          i % 2 === 0
            ? 1
            : -1;

        const y =
          750 +
          ((i * 223) % 2700);

        const pathX =
          790 +
          Math.sin(y / 320) *
            230;

        const x =
          pathX +
          side *
            (
              230 +
              (i % 5) * 45
            );

        treePositions.push([
          x,
          y,
          0.72 +
            (i % 4) * 0.08,
        ]);
      }

      treePositions.forEach(
        ([x, y, scale], i) => {
          const treeTexture =
            i % 9 === 0
              ? textures.treeOrange
              : i % 13 === 0
                ? textures.treeRed
                : textures.treeGreen;

          const tree = sprite(
            treeTexture,
            x,
            y,
            scale,
          );

          tree.__seed =
            i * 0.41;

          animatedTrees.push(
            tree,
          );

          camera.addChild(tree);

          if (i % 3 === 0) {
            const bush = sprite(
              i % 2 === 0
                ? textures.bushLarge
                : textures.bushSmall,
              x + 42,
              y + 38,
              0.6,
            );

            camera.addChild(bush);
          }
        },
      );

      // Stone approach / ruins
      [
        [380, 1750],
        [1180, 1710],
        [430, 1430],
        [1110, 1330],
      ].forEach(
        ([x, y]) => {
          camera.addChild(
            sprite(
              textures.castleWall,
              x,
              y,
              0.85,
            ),
          );
        },
      );

      // Castle approach
      for (
        let i = 0;
        i < 5;
        i += 1
      ) {
        camera.addChild(
          sprite(
            textures.castleWall,
            440 + i * 170,
            620,
            1.25,
          ),
        );
      }

      camera.addChild(
        sprite(
          textures.castleGate,
          800,
          600,
          1.45,
        ),
      );

      arena = createArena(
        textures,
      );

      arena.x = 800;
      arena.y = 360;

      camera.addChild(arena);

      LEVEL_POINTS.forEach(
        (point) => {
          camera.addChild(
            createLevelMarker(
              point.level,
              point.name,
              point.x,
              point.y,
            ),
          );
        },
      );

      // Decorative village NPCs.
      const npcWoman = sprite(
        textures.woman,
        480,
        3460,
        0.78,
      );

      const npcWizard = sprite(
        textures.wizard,
        1160,
        1910,
        0.75,
      );

      const npcHorse = sprite(
        textures.horse,
        325,
        3010,
        0.75,
      );

      camera.addChild(
        npcWoman,
        npcWizard,
        npcHorse,
      );

      // Player — visual only.
      // No fake progression state is applied.
      const entranceStart = {
        x: 760,
        y: 3950,
      };

      const entranceEnd = {
        x: LEVEL_POINTS[0].x,
        y: LEVEL_POINTS[0].y + 72,
      };

      player = sprite(
        textures.man,
        entranceStart.x,
        entranceStart.y,
        1.14,
      );

      camera.addChild(player);

      entranceAnimation = {
        delay: 35,
        progress: 0,
        duration: 145,
        startX: entranceStart.x,
        startY: entranceStart.y,
        endX: entranceEnd.x,
        endY: entranceEnd.y,
      };

      const startBoard =
        new Container();

      startBoard.x = 760;
      startBoard.y = 3890;

      const board =
        new Graphics();

      board.roundRect(
        -190,
        -48,
        380,
        96,
        18,
      );

      board.fill({
        color: 0x39261c,
        alpha: 0.94,
      });

      board.stroke({
        width: 5,
        color: 0xd6ad55,
      });

      const line1 =
        textLabel(
          'ROYAL VILLAGE',
          24,
        );

      line1.y = -15;

      const line2 =
        textLabel(
          'LEVELS 1–10',
          16,
        );

      line2.y = 19;

      startBoard.addChild(
        board,
        line1,
        line2,
      );

      camera.addChild(
        startBoard,
      );

      focusStart();

      const resizeObserver =
        new ResizeObserver(() => {
          clampCamera();
        });

      resizeObserver.observe(
        host,
      );

      app.__worldResizeObserver =
        resizeObserver;

      const handleOverview =
        () => {
          fitChapter();
        };

      const handleStart =
        () => {
          focusStart();
        };

      const handleZoomIn =
        () => {
          applyZoom(
            zoom * 1.2,
            app.renderer.width / 2,
            app.renderer.height / 2,
          );
        };

      const handleZoomOut =
        () => {
          applyZoom(
            zoom * 0.84,
            app.renderer.width / 2,
            app.renderer.height / 2,
          );
        };

      window.addEventListener(
        'pl-world-overview',
        handleOverview,
      );

      window.addEventListener(
        'pl-world-start',
        handleStart,
      );

      window.addEventListener(
        'pl-world-zoom-in',
        handleZoomIn,
      );

      window.addEventListener(
        'pl-world-zoom-out',
        handleZoomOut,
      );

      app.__worldNavigationCleanup =
        () => {
          window.removeEventListener(
            'pl-world-overview',
            handleOverview,
          );

          window.removeEventListener(
            'pl-world-start',
            handleStart,
          );

          window.removeEventListener(
            'pl-world-zoom-in',
            handleZoomIn,
          );

          window.removeEventListener(
            'pl-world-zoom-out',
            handleZoomOut,
          );
        };

      app.canvas.addEventListener(
        'wheel',
        (event) => {
          event.preventDefault();

          const bounds =
            app.canvas.getBoundingClientRect();

          applyZoom(
            zoom *
              (
                event.deltaY < 0
                  ? 1.12
                  : 0.89
              ),
            event.clientX -
              bounds.left,
            event.clientY -
              bounds.top,
          );
        },
        {
          passive: false,
        },
      );

      app.canvas.addEventListener(
        'pointerdown',
        (event) => {
          activePointers.set(
            event.pointerId,
            {
              x: event.clientX,
              y: event.clientY,
            },
          );

          try {
            app.canvas.setPointerCapture(
              event.pointerId,
            );
          } catch (_) {}

          if (
            activePointers.size === 1
          ) {
            dragging = true;

            dragStartX =
              event.clientX;

            dragStartY =
              event.clientY;

            cameraStartX =
              camera.x;

            cameraStartY =
              camera.y;
          }

          if (
            activePointers.size === 2
          ) {
            dragging = false;

            const points =
              Array.from(
                activePointers.values(),
              );

            pinchStartDistance =
              Math.hypot(
                points[1].x -
                  points[0].x,
                points[1].y -
                  points[0].y,
              );

            pinchStartZoom =
              zoom;
          }
        },
      );

      app.canvas.addEventListener(
        'pointermove',
        (event) => {
          if (
            activePointers.has(
              event.pointerId,
            )
          ) {
            activePointers.set(
              event.pointerId,
              {
                x: event.clientX,
                y: event.clientY,
              },
            );
          }

          if (
            activePointers.size ===
              2 &&
            pinchStartDistance &&
            pinchStartZoom
          ) {
            const points =
              Array.from(
                activePointers.values(),
              );

            const distance =
              Math.hypot(
                points[1].x -
                  points[0].x,
                points[1].y -
                  points[0].y,
              );

            const midpointX =
              (
                points[0].x +
                points[1].x
              ) / 2;

            const midpointY =
              (
                points[0].y +
                points[1].y
              ) / 2;

            const bounds =
              app.canvas.getBoundingClientRect();

            applyZoom(
              pinchStartZoom *
                (
                  distance /
                  pinchStartDistance
                ),
              midpointX -
                bounds.left,
              midpointY -
                bounds.top,
            );

            return;
          }

          if (
            !dragging ||
            activePointers.size !== 1
          ) {
            return;
          }

          camera.x =
            cameraStartX +
            event.clientX -
            dragStartX;

          camera.y =
            cameraStartY +
            event.clientY -
            dragStartY;

          clampCamera();
        },
      );

      const stopPointer =
        (event) => {
          activePointers.delete(
            event.pointerId,
          );

          if (
            activePointers.size <
            2
          ) {
            pinchStartDistance =
              null;

            pinchStartZoom =
              null;
          }

          if (
            activePointers.size ===
            1
          ) {
            const remaining =
              Array.from(
                activePointers.values(),
              )[0];

            dragging = true;

            dragStartX =
              remaining.x;

            dragStartY =
              remaining.y;

            cameraStartX =
              camera.x;

            cameraStartY =
              camera.y;

            return;
          }

          dragging = false;
        };

      app.canvas.addEventListener(
        'pointerup',
        stopPointer,
      );

      app.canvas.addEventListener(
        'pointercancel',
        stopPointer,
      );

      let elapsed = 0;

      app.ticker.add(
        (ticker) => {
          elapsed +=
            ticker.deltaTime *
            0.03;

          animatedWater.forEach(
            (water, index) => {
              water.y +=
                Math.sin(
                  elapsed * 2 +
                    index * 0.7,
                ) *
                0.05;
            },
          );

          animatedTrees.forEach(
            (tree) => {
              tree.rotation =
                Math.sin(
                  elapsed * 1.5 +
                    tree.__seed,
                ) *
                0.012;
            },
          );

          if (arena) {
            arena.__board.alpha =
              0.92 +
              Math.sin(
                elapsed * 2,
              ) *
              0.06;
          }

          if (
            player &&
            entranceAnimation
          ) {
            if (
              entranceAnimation.delay > 0
            ) {
              entranceAnimation.delay -=
                ticker.deltaTime;
            } else if (
              entranceAnimation.progress < 1
            ) {
              entranceAnimation.progress +=
                ticker.deltaTime /
                entranceAnimation.duration;

              entranceAnimation.progress =
                Math.min(
                  1,
                  entranceAnimation.progress,
                );

              const t =
                entranceAnimation.progress;

              // Smooth ease-in/out.
              const eased =
                t < 0.5
                  ? 2 * t * t
                  : 1 -
                    Math.pow(
                      -2 * t + 2,
                      2,
                    ) / 2;

              // Slight curved entrance rather than a straight slide.
              const curve =
                Math.sin(
                  eased * Math.PI,
                ) * 32;

              player.x =
                entranceAnimation.startX +
                (
                  entranceAnimation.endX -
                  entranceAnimation.startX
                ) *
                eased +
                curve;

              player.y =
                entranceAnimation.startY +
                (
                  entranceAnimation.endY -
                  entranceAnimation.startY
                ) *
                eased;

              // Simple walking bounce.
              player.rotation =
                Math.sin(
                  elapsed * 8,
                ) *
                0.035;

              const mobile =
                app.renderer.width <= 760;

              if (mobile) {
                const desiredCameraX =
                  app.renderer.width / 2 -
                  player.x * zoom;

                const desiredCameraY =
                  app.renderer.height * 0.68 -
                  player.y * zoom;

                camera.x +=
                  (
                    desiredCameraX -
                    camera.x
                  ) *
                  0.065;

                camera.y +=
                  (
                    desiredCameraY -
                    camera.y
                  ) *
                  0.065;

                clampCamera();
              }
            } else {
              // Idle after reaching Level 1.
              player.rotation = 0;

              player.y =
                entranceAnimation.endY +
                Math.sin(
                  elapsed * 2.6,
                ) *
                2;
            }
          }
        },
      );
    };

    start().catch(
      (error) => {
        console.error(
          '[PrizeLeagueWorld] Royal Village failed:',
          error,
        );
      },
    );

    return () => {
      destroyed = true;

      if (
        app?.__worldResizeObserver
      ) {
        app.__worldResizeObserver.disconnect();
      }

      if (
        app?.__worldNavigationCleanup
      ) {
        app.__worldNavigationCleanup();
      }

      if (
        app &&
        initialized
      ) {
        app.destroy(
          true,
          {
            children: true,
            texture: false,
            textureSource: false,
          },
        );
      }

      if (host) {
        host.replaceChildren();
      }
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="pl-world-render-host"
      aria-label="Prize League Royal Village Levels 1 to 10"
    />
  );
}
