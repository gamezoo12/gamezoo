import { useEffect, useRef } from 'react';
import {
  Application,
  Container,
  Graphics,
  Text,
} from 'pixi.js';

import {
  KINGDOM_REGIONS,
  SEASON_ONE_DESTINATIONS,
} from '../data/season1Map';

const WORLD_WIDTH = 13200;
const WORLD_HEIGHT = 5800;

const REGION_WIDTH = 1260;
const REGION_HEIGHT = 2150;
const REGION_GAP_X = 80;
const REGION_GAP_Y = 230;

const MIN_ZOOM = 0.11;
const MAX_ZOOM = 1.15;

const THEMES = {
  village: {
    ground: 0x77b962,
    darkGround: 0x4f8a4c,
    path: 0xd3b47c,
    water: 0x55b9d6,
    accent: 0xf3c85d,
    building: 0xc99465,
    roof: 0x8c453f,
  },
  forest: {
    ground: 0x397f45,
    darkGround: 0x245a35,
    path: 0xa98d62,
    water: 0x4598b5,
    accent: 0x9ad96f,
    building: 0x8e7655,
    roof: 0x42563d,
  },
  river: {
    ground: 0x70aa65,
    darkGround: 0x477c52,
    path: 0xc2a676,
    water: 0x3f9fc8,
    accent: 0x75d7eb,
    building: 0xd0b081,
    roof: 0x657690,
  },
  desert: {
    ground: 0xd8bd77,
    darkGround: 0xb28b50,
    path: 0xe9d39b,
    water: 0x4cb3c2,
    accent: 0xf2d261,
    building: 0xc39558,
    roof: 0x85563c,
  },
  mountain: {
    ground: 0x78856d,
    darkGround: 0x515c51,
    path: 0xb8a57f,
    water: 0x6daec4,
    accent: 0xd4d4c8,
    building: 0x838074,
    roof: 0x4c4d53,
  },
  ice: {
    ground: 0xa9d2d8,
    darkGround: 0x729ea9,
    path: 0xdde6df,
    water: 0x70cce5,
    accent: 0xe9fbff,
    building: 0xa7c0ca,
    roof: 0x6b829e,
  },
  temple: {
    ground: 0x758953,
    darkGround: 0x536338,
    path: 0xb9a371,
    water: 0x4ca29b,
    accent: 0xd9bc62,
    building: 0x9b8a68,
    roof: 0x67644e,
  },
  volcano: {
    ground: 0x574c43,
    darkGround: 0x39332f,
    path: 0x806b58,
    water: 0xa33d25,
    accent: 0xe87c3e,
    building: 0x70655c,
    roof: 0x3d3430,
  },
  sky: {
    ground: 0xaac7b3,
    darkGround: 0x7da08e,
    path: 0xd7d2b3,
    water: 0x85cfe0,
    accent: 0xf4e0a0,
    building: 0xc2bba8,
    roof: 0x74859e,
  },
  crown: {
    ground: 0x648950,
    darkGround: 0x425e38,
    path: 0xd5bb77,
    water: 0x5aa9c3,
    accent: 0xf5c542,
    building: 0xc7a56d,
    roof: 0x703c4e,
  },
};

function makeText(text, options = {}) {
  const label = new Text({
    text,
    style: {
      fontFamily: 'Georgia, Times New Roman, serif',
      fill: options.fill ?? 0xffffff,
      fontSize: options.fontSize ?? 22,
      fontWeight: options.fontWeight ?? '700',
      align: options.align ?? 'center',
      letterSpacing: options.letterSpacing ?? 0,
      stroke: options.stroke
        ? {
            color: options.stroke,
            width: options.strokeWidth ?? 4,
          }
        : undefined,
    },
  });

  if (options.anchor !== false) {
    label.anchor.set(0.5);
  }

  return label;
}

function createTree(x, y, scale = 1, snowy = false) {
  const tree = new Container();
  tree.x = x;
  tree.y = y;
  tree.scale.set(scale);

  const shadow = new Graphics();
  shadow.ellipse(0, 9, 25, 9);
  shadow.fill({
    color: 0x132619,
    alpha: 0.18,
  });

  const trunk = new Graphics();
  trunk.roundRect(-5, -35, 10, 45, 4);
  trunk.fill(0x765037);

  const foliage = new Graphics();

  foliage.circle(0, -55, 23);
  foliage.circle(-16, -43, 18);
  foliage.circle(17, -43, 18);

  foliage.fill(
    snowy
      ? 0xe8f5f5
      : 0x2f7543,
  );

  tree.addChild(shadow, trunk, foliage);

  return tree;
}

function createMountain(x, y, scale = 1, snowy = false) {
  const mountain = new Container();
  mountain.x = x;
  mountain.y = y;
  mountain.scale.set(scale);

  const back = new Graphics();
  back.moveTo(-100, 40);
  back.lineTo(0, -95);
  back.lineTo(100, 40);
  back.closePath();
  back.fill(0x657064);

  const face = new Graphics();
  face.moveTo(-15, -74);
  face.lineTo(0, -95);
  face.lineTo(30, -54);
  face.lineTo(16, -61);
  face.lineTo(8, -45);
  face.closePath();
  face.fill(
    snowy
      ? 0xf5f9f7
      : 0xb3b0a0,
  );

  mountain.addChild(back, face);

  return mountain;
}

function createVillageHouse(x, y, theme, scale = 1) {
  const house = new Container();
  house.x = x;
  house.y = y;
  house.scale.set(scale);

  const shadow = new Graphics();
  shadow.ellipse(0, 9, 37, 14);
  shadow.fill({
    color: 0x182018,
    alpha: 0.2,
  });

  const body = new Graphics();
  body.roundRect(-28, -42, 56, 50, 7);
  body.fill(theme.building);

  const roof = new Graphics();
  roof.moveTo(-37, -39);
  roof.lineTo(0, -73);
  roof.lineTo(37, -39);
  roof.closePath();
  roof.fill(theme.roof);

  const door = new Graphics();
  door.roundRect(-7, -18, 14, 26, 4);
  door.fill(0x51352d);

  const chimney = new Graphics();
  chimney.rect(14, -65, 7, 21);
  chimney.fill(0x665148);

  house.addChild(
    shadow,
    body,
    chimney,
    roof,
    door,
  );

  return house;
}

function createCastle(x, y, theme, scale = 1) {
  const castle = new Container();
  castle.x = x;
  castle.y = y;
  castle.scale.set(scale);

  const shadow = new Graphics();
  shadow.ellipse(0, 25, 105, 30);
  shadow.fill({
    color: 0x171717,
    alpha: 0.22,
  });

  const main = new Graphics();
  main.roundRect(-70, -98, 140, 120, 9);
  main.fill(theme.building);

  const leftTower = new Graphics();
  leftTower.roundRect(-105, -120, 50, 140, 6);
  leftTower.fill(theme.building);

  const rightTower = new Graphics();
  rightTower.roundRect(55, -120, 50, 140, 6);
  rightTower.fill(theme.building);

  const battlements = new Graphics();

  for (let i = -3; i <= 3; i += 1) {
    battlements.rect(i * 19 - 7, -112, 14, 20);
  }

  battlements.fill(theme.accent);

  const gate = new Graphics();
  gate.roundRect(-22, -34, 44, 56, 22);
  gate.fill(0x2f2927);

  const banners = new Graphics();
  banners.rect(-89, -103, 13, 38);
  banners.rect(76, -103, 13, 38);
  banners.fill(0xb33338);

  castle.addChild(
    shadow,
    main,
    leftTower,
    rightTower,
    battlements,
    gate,
    banners,
  );

  return castle;
}

function createTorch(x, y) {
  const torch = new Container();
  torch.x = x;
  torch.y = y;

  const pole = new Graphics();
  pole.roundRect(-2, -19, 4, 24, 2);
  pole.fill(0x5f402d);

  const flame = new Graphics();
  flame.moveTo(0, -34);
  flame.bezierCurveTo(-12, -23, -9, -13, 0, -12);
  flame.bezierCurveTo(10, -14, 12, -24, 0, -34);
  flame.fill(0xffbe3b);

  torch.addChild(pole, flame);
  torch.flame = flame;
  torch.seed = Math.random() * Math.PI * 2;

  return torch;
}

function createLevelMarker(levelNumber, x, y) {
  const marker = new Container();
  marker.x = x;
  marker.y = y;

  const shadow = new Graphics();
  shadow.ellipse(0, 8, 18, 7);
  shadow.fill({
    color: 0x151515,
    alpha: 0.2,
  });

  const stone = new Graphics();
  stone.roundRect(-16, -30, 32, 35, 9);
  stone.fill(0x77766e);

  const plaque = new Graphics();
  plaque.roundRect(-12, -25, 24, 21, 6);
  plaque.fill(0xc7a85f);

  const number = makeText(String(levelNumber), {
    fontSize: levelNumber >= 100 ? 8 : 9,
    fill: 0x332719,
    fontWeight: '900',
  });

  number.y = -14;

  marker.addChild(
    shadow,
    stone,
    plaque,
    number,
  );

  return marker;
}

function createArena(arena, x, y, theme) {
  const root = new Container();
  root.x = x;
  root.y = y;

  root.__arena = arena;

  const shadow = new Graphics();
  shadow.ellipse(0, 25, 95, 28);
  shadow.fill({
    color: 0x19150f,
    alpha: 0.25,
  });

  const base = new Graphics();
  base.roundRect(-80, -65, 160, 85, 14);
  base.fill(0x554739);

  const wall = new Graphics();
  wall.roundRect(-66, -110, 132, 60, 10);
  wall.fill(theme.building);

  const towers = new Graphics();
  towers.roundRect(-88, -120, 37, 122, 8);
  towers.roundRect(51, -120, 37, 122, 8);
  towers.fill(theme.building);

  const crowns = new Graphics();
  crowns.moveTo(-90, -116);
  crowns.lineTo(-70, -147);
  crowns.lineTo(-50, -116);
  crowns.closePath();

  crowns.moveTo(50, -116);
  crowns.lineTo(70, -147);
  crowns.lineTo(90, -116);
  crowns.closePath();

  crowns.fill(0xd6af45);

  const gate = new Graphics();
  gate.roundRect(-22, -44, 44, 64, 22);
  gate.fill(0x211a17);

  const board = new Graphics();
  board.roundRect(-76, -200, 152, 63, 12);
  board.fill(0x38251c);
  board.stroke({
    width: 5,
    color: 0xd6af45,
  });

  const title = makeText(
    arena.finalArena
      ? 'FINAL CROWN ARENA'
      : `CHAMPION ARENA ${arena.arenaNumber}`,
    {
      fontSize: arena.finalArena ? 11 : 10,
      fill: 0xffe699,
      fontWeight: '900',
    },
  );

  title.y = -185;

  const prize = makeText(
    arena.prize
      ? `£${arena.prize}`
      : 'MYSTERY PRIZE',
    {
      fontSize: arena.prize ? 22 : 14,
      fill: 0xffffff,
      fontWeight: '900',
    },
  );

  prize.y = -158;

  const crown = makeText(
    '♛',
    {
      fontSize: 24,
      fill: 0xffd453,
    },
  );

  crown.y = -112;

  root.addChild(
    shadow,
    base,
    wall,
    towers,
    crowns,
    gate,
    board,
    title,
    prize,
    crown,
  );

  root.board = board;
  root.crown = crown;
  root.animationSeed = arena.arenaNumber * 0.47;

  return root;
}

function createRegionBanner(region, x, y) {
  const root = new Container();
  root.x = x;
  root.y = y;

  const board = new Graphics();
  board.roundRect(-220, -52, 440, 104, 18);
  board.fill({
    color: 0x2f211a,
    alpha: 0.94,
  });
  board.stroke({
    width: 5,
    color: 0xb99a58,
  });

  const regionNumber = makeText(
    `KINGDOM ${String(region.id).padStart(2, '0')}`,
    {
      fontSize: 13,
      fill: 0xdcbf78,
      letterSpacing: 2,
      fontWeight: '900',
    },
  );

  regionNumber.y = -27;

  const name = makeText(
    region.name,
    {
      fontSize: 26,
      fill: 0xffffff,
      fontWeight: '900',
    },
  );

  name.y = 1;

  const subtitle = makeText(
    region.subtitle,
    {
      fontSize: 11,
      fill: 0xe0d5bf,
      fontWeight: '600',
    },
  );

  subtitle.y = 30;

  root.addChild(
    board,
    regionNumber,
    name,
    subtitle,
  );

  return root;
}

function regionPosition(regionIndex) {
  const row = Math.floor(regionIndex / 5);
  const column =
    row % 2 === 0
      ? regionIndex % 5
      : 4 - (regionIndex % 5);

  return {
    x: 520 + column * (REGION_WIDTH + REGION_GAP_X),
    y: 470 + row * (REGION_HEIGHT + REGION_GAP_Y),
  };
}

function destinationLocalPosition(localIndex) {
  const column = Math.floor(localIndex / 10);
  const rowInColumn = localIndex % 10;

  const reverse = column % 2 === 1;

  const row = reverse
    ? 9 - rowInColumn
    : rowInColumn;

  return {
    x: 130 + column * 215,
    y: 280 + row * 148,
  };
}

function createRegionTerrain(region, originX, originY) {
  const theme = THEMES[region.theme];
  const regionContainer = new Container();

  regionContainer.x = originX;
  regionContainer.y = originY;

  const base = new Graphics();
  base.roundRect(
    0,
    0,
    REGION_WIDTH,
    REGION_HEIGHT,
    100,
  );
  base.fill(theme.ground);

  const edge = new Graphics();
  edge.roundRect(
    18,
    18,
    REGION_WIDTH - 36,
    REGION_HEIGHT - 36,
    90,
  );
  edge.stroke({
    width: 8,
    color: theme.darkGround,
    alpha: 0.35,
  });

  const river = new Graphics();

  river.moveTo(40, 1630);
  river.bezierCurveTo(
    250,
    1510,
    420,
    1770,
    650,
    1640,
  );
  river.bezierCurveTo(
    870,
    1515,
    1030,
    1740,
    1220,
    1595,
  );

  river.stroke({
    width: region.theme === 'volcano' ? 74 : 64,
    color: theme.water,
    alpha: 0.9,
  });

  const road = new Graphics();

  for (let chapter = 0; chapter < 5; chapter += 1) {
    const start = destinationLocalPosition(chapter * 10);
    const end = destinationLocalPosition(chapter * 10 + 9);

    road.moveTo(start.x, start.y);
    road.bezierCurveTo(
      start.x + 65,
      (start.y + end.y) / 2,
      end.x - 65,
      (start.y + end.y) / 2,
      end.x,
      end.y,
    );
  }

  road.stroke({
    width: 34,
    color: theme.path,
    alpha: 0.95,
  });

  regionContainer.addChild(
    base,
    edge,
    river,
    road,
  );

  const snowy =
    region.theme === 'ice' ||
    region.theme === 'mountain';

  for (let i = 0; i < 24; i += 1) {
    const x =
      45 +
      ((i * 193) % (REGION_WIDTH - 90));

    const y =
      170 +
      ((i * 281) % (REGION_HEIGHT - 280));

    if (i % 6 === 0) {
      regionContainer.addChild(
        createMountain(
          x,
          y,
          0.75 + (i % 3) * 0.15,
          snowy,
        ),
      );
    } else {
      regionContainer.addChild(
        createTree(
          x,
          y,
          0.62 + (i % 4) * 0.08,
          region.theme === 'ice',
        ),
      );
    }
  }

  for (let i = 0; i < 9; i += 1) {
    regionContainer.addChild(
      createVillageHouse(
        180 + ((i * 311) % 880),
        210 + ((i * 401) % 1600),
        theme,
        0.72 + (i % 3) * 0.08,
      ),
    );
  }

  regionContainer.addChild(
    createCastle(
      REGION_WIDTH - 180,
      215,
      theme,
      region.id === 10 ? 1.25 : 0.9,
    ),
  );

  return regionContainer;
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
    let zoom = 0.22;

    let dragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let cameraStartX = 0;
    let cameraStartY = 0;

    const arenas = [];
    const torches = [];
    const clouds = [];

    const clampCamera = () => {
      if (!app || !camera) return;

      const rendererWidth = app.renderer.width;
      const rendererHeight = app.renderer.height;

      const scaledWorldWidth = WORLD_WIDTH * zoom;
      const scaledWorldHeight = WORLD_HEIGHT * zoom;

      const minimumX =
        rendererWidth - scaledWorldWidth - 150;

      const minimumY =
        rendererHeight - scaledWorldHeight - 150;

      camera.x = Math.min(
        150,
        Math.max(minimumX, camera.x),
      );

      camera.y = Math.min(
        150,
        Math.max(minimumY, camera.y),
      );
    };

    const applyZoom = (
      nextZoom,
      pointerX,
      pointerY,
    ) => {
      if (!camera) return;

      const oldZoom = zoom;

      zoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, nextZoom),
      );

      const worldX =
        (pointerX - camera.x) / oldZoom;

      const worldY =
        (pointerY - camera.y) / oldZoom;

      camera.scale.set(zoom);

      camera.x =
        pointerX - worldX * zoom;

      camera.y =
        pointerY - worldY * zoom;

      clampCamera();
    };

    const fitWorld = () => {
      if (!app || !camera) return;

      const width = app.renderer.width;
      const height = app.renderer.height;

      zoom = Math.min(
        width / WORLD_WIDTH,
        height / WORLD_HEIGHT,
      ) * 0.94;

      zoom = Math.max(
        MIN_ZOOM,
        Math.min(0.24, zoom),
      );

      camera.scale.set(zoom);

      camera.x =
        (width - WORLD_WIDTH * zoom) / 2;

      camera.y =
        (height - WORLD_HEIGHT * zoom) / 2;
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

      camera = new Container();

      app.stage.addChild(camera);

      const worldBackground = new Graphics();
      worldBackground.rect(
        0,
        0,
        WORLD_WIDTH,
        WORLD_HEIGHT,
      );
      worldBackground.fill(0x9ccbe0);

      camera.addChild(worldBackground);

      const parchment = new Graphics();
      parchment.roundRect(
        120,
        110,
        WORLD_WIDTH - 240,
        WORLD_HEIGHT - 220,
        120,
      );
      parchment.fill({
        color: 0xb8c991,
        alpha: 0.42,
      });

      camera.addChild(parchment);

      for (let i = 0; i < 18; i += 1) {
        const cloud = new Container();

        cloud.x =
          300 +
          ((i * 811) % (WORLD_WIDTH - 600));

        cloud.y =
          140 +
          ((i * 317) % (WORLD_HEIGHT - 400));

        const shape = new Graphics();
        shape.circle(-35, 0, 28);
        shape.circle(0, -14, 38);
        shape.circle(39, 1, 27);
        shape.roundRect(-60, -2, 120, 35, 18);
        shape.fill({
          color: 0xffffff,
          alpha: 0.32,
        });

        cloud.addChild(shape);
        cloud.speed =
          0.1 + (i % 4) * 0.035;

        clouds.push(cloud);
        camera.addChild(cloud);
      }

      KINGDOM_REGIONS.forEach(
        (region, regionIndex) => {
          const origin =
            regionPosition(regionIndex);

          const terrain =
            createRegionTerrain(
              region,
              origin.x,
              origin.y,
            );

          camera.addChild(terrain);

          const banner =
            createRegionBanner(
              region,
              origin.x + REGION_WIDTH / 2,
              origin.y + 95,
            );

          camera.addChild(banner);

          const regionDestinations =
            SEASON_ONE_DESTINATIONS.filter(
              (destination) =>
                destination.regionId ===
                region.id,
            );

          let progressionIndex = 0;

          regionDestinations.forEach(
            (destination) => {
              if (
                destination.type ===
                'level'
              ) {
                const localPosition =
                  destinationLocalPosition(
                    progressionIndex,
                  );

                const marker =
                  createLevelMarker(
                    destination.levelNumber,
                    origin.x +
                      localPosition.x,
                    origin.y +
                      localPosition.y,
                  );

                camera.addChild(marker);

                progressionIndex += 1;

                return;
              }

              const chapterWithinRegion =
                ((destination.arenaNumber -
                  1) %
                  5);

              const arenaX =
                origin.x +
                1180 -
                chapterWithinRegion * 16;

              const arenaY =
                origin.y +
                440 +
                chapterWithinRegion * 325;

              const arena =
                createArena(
                  destination,
                  arenaX,
                  arenaY,
                  THEMES[region.theme],
                );

              arenas.push(arena);
              camera.addChild(arena);

              const leftTorch =
                createTorch(
                  arenaX - 103,
                  arenaY - 20,
                );

              const rightTorch =
                createTorch(
                  arenaX + 103,
                  arenaY - 20,
                );

              torches.push(
                leftTorch,
                rightTorch,
              );

              camera.addChild(
                leftTorch,
                rightTorch,
              );
            },
          );
        },
      );

      const seasonGate =
        createCastle(
          480,
          380,
          THEMES.village,
          1.5,
        );

      camera.addChild(seasonGate);

      const seasonBoard = new Container();
      seasonBoard.x = 760;
      seasonBoard.y = 250;

      const seasonPanel =
        new Graphics();

      seasonPanel.roundRect(
        -300,
        -90,
        600,
        180,
        26,
      );

      seasonPanel.fill({
        color: 0x2a1b16,
        alpha: 0.96,
      });

      seasonPanel.stroke({
        width: 8,
        color: 0xc9a244,
      });

      const seasonTitle =
        makeText(
          'PRIZE LEAGUE WORLD — SEASON 1',
          {
            fontSize: 24,
            fill: 0xffe7a1,
            fontWeight: '900',
          },
        );

      seasonTitle.y = -48;

      const seasonPrize =
        makeText(
          'UP TO £127,500 IN SEASON PRIZES',
          {
            fontSize: 31,
            fill: 0xffffff,
            fontWeight: '900',
          },
        );

      seasonPrize.y = 0;

      const seasonMeta =
        makeText(
          '500 LEVELS  •  50 CHAMPION ARENAS',
          {
            fontSize: 17,
            fill: 0xd9c899,
            fontWeight: '700',
          },
        );

      seasonMeta.y = 47;

      seasonBoard.addChild(
        seasonPanel,
        seasonTitle,
        seasonPrize,
        seasonMeta,
      );

      camera.addChild(seasonBoard);

      const finalRegion =
        regionPosition(9);

      const finalCrown = makeText(
        '♛',
        {
          fontSize: 120,
          fill: 0xffd75a,
          stroke: 0x513712,
          strokeWidth: 8,
        },
      );

      finalCrown.x =
        finalRegion.x +
        REGION_WIDTH -
        80;

      finalCrown.y =
        finalRegion.y +
        160;

      camera.addChild(finalCrown);

      fitWorld();

      const resizeObserver =
        new ResizeObserver(() => {
          clampCamera();
        });

      resizeObserver.observe(host);

      app.__worldResizeObserver =
        resizeObserver;

      app.canvas.addEventListener(
        'wheel',
        (event) => {
          event.preventDefault();

          const bounds =
            app.canvas.getBoundingClientRect();

          const pointerX =
            event.clientX - bounds.left;

          const pointerY =
            event.clientY - bounds.top;

          const factor =
            event.deltaY < 0
              ? 1.12
              : 0.89;

          applyZoom(
            zoom * factor,
            pointerX,
            pointerY,
          );
        },
        {
          passive: false,
        },
      );

      app.canvas.addEventListener(
        'pointerdown',
        (event) => {
          dragging = true;

          dragStartX = event.clientX;
          dragStartY = event.clientY;

          cameraStartX = camera.x;
          cameraStartY = camera.y;

          app.canvas.setPointerCapture(
            event.pointerId,
          );

          app.canvas.style.cursor =
            'grabbing';
        },
      );

      app.canvas.addEventListener(
        'pointermove',
        (event) => {
          if (!dragging) return;

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

      const stopDragging = () => {
        dragging = false;

        if (app?.canvas) {
          app.canvas.style.cursor =
            'grab';
        }
      };

      app.canvas.addEventListener(
        'pointerup',
        stopDragging,
      );

      app.canvas.addEventListener(
        'pointercancel',
        stopDragging,
      );

      app.canvas.style.cursor = 'grab';

      let elapsed = 0;

      app.ticker.add((ticker) => {
        elapsed +=
          ticker.deltaTime * 0.035;

        clouds.forEach(
          (cloud, index) => {
            cloud.x +=
              cloud.speed *
              ticker.deltaTime;

            cloud.y +=
              Math.sin(
                elapsed +
                  index * 0.7,
              ) *
              0.025;

            if (
              cloud.x >
              WORLD_WIDTH + 200
            ) {
              cloud.x = -200;
            }
          },
        );

        arenas.forEach(
          (arena) => {
            const wave =
              Math.sin(
                elapsed * 2 +
                  arena.animationSeed,
              );

            arena.crown.y =
              -112 + wave * 3;

            arena.board.alpha =
              0.9 +
              Math.abs(wave) * 0.1;

            if (
              arena.__arena.finalArena
            ) {
              const pulse =
                1 +
                Math.sin(
                  elapsed * 1.7,
                ) *
                  0.025;

              arena.scale.set(pulse);
            }
          },
        );

        torches.forEach((torch) => {
          const scale =
            0.92 +
            Math.sin(
              elapsed * 5 +
                torch.seed,
            ) *
              0.1;

          torch.flame.scale.set(
            1,
            scale,
          );
        });
      });
    };

    start().catch((error) => {
      console.error(
        '[PrizeLeagueWorld] Kingdom map renderer failed:',
        error,
      );
    });

    return () => {
      destroyed = true;

      if (
        app?.__worldResizeObserver
      ) {
        app.__worldResizeObserver.disconnect();
      }

      if (app && initialized) {
        app.destroy(true, {
          children: true,
          texture: true,
          textureSource: true,
        });
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
      aria-label="Prize League Season 1 kingdom world"
    />
  );
}
