import { useEffect, useRef } from 'react';
import {
  Application,
  Container,
  Graphics,
  Text,
} from 'pixi.js';

const WORLD_WIDTH = 2400;
const WORLD_HEIGHT = 1350;

function roundedPanel(x, y, width, height, fill, alpha = 1) {
  const g = new Graphics();

  g.roundRect(x, y, width, height, 28);
  g.fill({
    color: fill,
    alpha,
  });

  return g;
}

function createCloud(x, y, scale = 1) {
  const cloud = new Container();
  cloud.x = x;
  cloud.y = y;
  cloud.scale.set(scale);

  const shadow = new Graphics();
  shadow.ellipse(20, 18, 105, 35);
  shadow.fill({
    color: 0x77b6cf,
    alpha: 0.12,
  });

  const body = new Graphics();

  body.circle(-52, 0, 38);
  body.circle(-8, -21, 53);
  body.circle(42, -3, 42);
  body.roundRect(-88, -5, 175, 52, 26);

  body.fill({
    color: 0xffffff,
    alpha: 0.88,
  });

  cloud.addChild(shadow, body);

  cloud.worldSpeed = 0.12 + Math.random() * 0.08;

  return cloud;
}

function createTree(x, y, scale = 1) {
  const tree = new Container();

  tree.x = x;
  tree.y = y;
  tree.scale.set(scale);

  const shadow = new Graphics();
  shadow.ellipse(0, 12, 44, 17);
  shadow.fill({
    color: 0x123e30,
    alpha: 0.14,
  });

  const trunk = new Graphics();
  trunk.roundRect(-8, -52, 16, 64, 7);
  trunk.fill(0x815739);

  const crownBack = new Graphics();
  crownBack.circle(-20, -66, 30);
  crownBack.circle(20, -67, 31);
  crownBack.fill(0x16784c);

  const crown = new Graphics();
  crown.circle(0, -91, 39);
  crown.circle(-26, -82, 28);
  crown.circle(29, -81, 29);
  crown.fill(0x24a968);

  tree.addChild(shadow, trunk, crownBack, crown);

  return tree;
}

function createHouse(x, y, bodyColor, roofColor, scale = 1) {
  const house = new Container();

  house.x = x;
  house.y = y;
  house.scale.set(scale);

  const shadow = new Graphics();
  shadow.ellipse(0, 20, 95, 34);
  shadow.fill({
    color: 0x17394f,
    alpha: 0.16,
  });

  const body = new Graphics();
  body.roundRect(-70, -94, 140, 112, 17);
  body.fill(bodyColor);

  const roof = new Graphics();
  roof.moveTo(-88, -91);
  roof.lineTo(0, -155);
  roof.lineTo(88, -91);
  roof.closePath();
  roof.fill(roofColor);

  const door = new Graphics();
  door.roundRect(-17, -43, 34, 60, 8);
  door.fill(0x5a392d);

  const windows = new Graphics();
  windows.roundRect(-54, -67, 28, 30, 7);
  windows.roundRect(26, -67, 28, 30, 7);
  windows.fill(0x9fe7ff);

  house.addChild(shadow, body, roof, windows, door);

  return house;
}

function createPrizeArena(x, y) {
  const arena = new Container();

  arena.x = x;
  arena.y = y;

  const shadow = new Graphics();
  shadow.ellipse(0, 36, 190, 65);
  shadow.fill({
    color: 0x111827,
    alpha: 0.22,
  });

  const base = new Graphics();
  base.roundRect(-160, -95, 320, 125, 35);
  base.fill(0x172038);

  const upper = new Graphics();
  upper.roundRect(-128, -153, 256, 76, 28);
  upper.fill(0x273555);

  const roof = new Graphics();
  roof.moveTo(-145, -145);
  roof.lineTo(0, -230);
  roof.lineTo(145, -145);
  roof.closePath();
  roof.fill(0xffc932);

  const entrance = new Graphics();
  entrance.roundRect(-42, -75, 84, 105, 25);
  entrance.fill(0x090e1c);

  const glow = new Graphics();
  glow.circle(0, -184, 37);
  glow.fill({
    color: 0xffdf65,
    alpha: 0.95,
  });

  const trophy = new Text({
    text: '🏆',
    style: {
      fontSize: 43,
    },
  });

  trophy.anchor.set(0.5);
  trophy.x = 0;
  trophy.y = -186;

  const title = new Text({
    text: 'PRIZE ARENA',
    style: {
      fontFamily: 'Arial, sans-serif',
      fontSize: 26,
      fontWeight: '900',
      fill: 0xffffff,
      letterSpacing: 2,
    },
  });

  title.anchor.set(0.5);
  title.y = -115;

  arena.addChild(
    shadow,
    base,
    upper,
    roof,
    entrance,
    glow,
    trophy,
    title,
  );

  return arena;
}

function createLevelMarker(level, x, y) {
  const marker = new Container();

  marker.x = x;
  marker.y = y;

  const shadow = new Graphics();
  shadow.ellipse(0, 25, 50, 20);
  shadow.fill({
    color: 0x12283e,
    alpha: 0.18,
  });

  const outer = new Graphics();
  outer.circle(0, 0, 47);
  outer.fill(0xffffff);

  const inner = new Graphics();
  inner.circle(0, 0, 38);
  inner.fill(0x17213d);

  const ring = new Graphics();
  ring.circle(0, 0, 40);
  ring.stroke({
    width: 5,
    color: 0xffc62f,
  });

  const number = new Text({
    text: String(level),
    style: {
      fontFamily: 'Arial, sans-serif',
      fontSize: 27,
      fontWeight: '900',
      fill: 0xffffff,
    },
  });

  number.anchor.set(0.5);

  marker.addChild(shadow, outer, inner, ring, number);

  marker.pulseSeed = level * 0.7;

  return marker;
}

function createPlayer() {
  const player = new Container();

  const shadow = new Graphics();
  shadow.ellipse(0, 14, 25, 11);
  shadow.fill({
    color: 0x07182a,
    alpha: 0.25,
  });

  const legs = new Graphics();
  legs.roundRect(-13, -7, 11, 28, 6);
  legs.roundRect(3, -7, 11, 28, 6);
  legs.fill(0x1f2937);

  const body = new Graphics();
  body.roundRect(-21, -58, 42, 55, 15);
  body.fill(0x111827);

  const head = new Graphics();
  head.circle(0, -79, 21);
  head.fill(0xd9a079);

  const hair = new Graphics();
  hair.arc(0, -82, 22, Math.PI, Math.PI * 2);
  hair.lineTo(22, -81);
  hair.arc(0, -80, 21, 0, Math.PI, true);
  hair.fill(0x151515);

  const badge = new Graphics();
  badge.circle(0, -35, 6);
  badge.fill(0xffc62f);

  player.addChild(shadow, legs, body, head, hair, badge);

  return player;
}

export default function WorldCanvas() {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) return undefined;

    let destroyed = false;
    let initialized = false;
    let app = null;

    const start = async () => {
      app = new Application();

      await app.init({
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        resizeTo: host,
        preference: 'webgl',
      });

      initialized = true;

      if (destroyed) {
        app.destroy(true, { children: true });
        return;
      }

      app.canvas.className = 'pl-world-canvas';
      host.appendChild(app.canvas);

      const world = new Container();

      app.stage.addChild(world);

      const sky = new Graphics();
      sky.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      sky.fill(0xa9e5ff);

      const distantHills = new Graphics();

      distantHills.moveTo(0, 530);
      distantHills.bezierCurveTo(250, 250, 460, 470, 680, 315);
      distantHills.bezierCurveTo(880, 190, 1080, 430, 1270, 286);
      distantHills.bezierCurveTo(1510, 105, 1760, 430, 1990, 250);
      distantHills.bezierCurveTo(2160, 135, 2310, 310, 2400, 270);
      distantHills.lineTo(WORLD_WIDTH, 620);
      distantHills.lineTo(0, 620);
      distantHills.closePath();
      distantHills.fill(0x78bd91);

      const midHills = new Graphics();

      midHills.moveTo(0, 610);
      midHills.bezierCurveTo(230, 430, 410, 650, 660, 455);
      midHills.bezierCurveTo(880, 340, 1110, 620, 1340, 420);
      midHills.bezierCurveTo(1530, 300, 1810, 570, 2040, 405);
      midHills.bezierCurveTo(2220, 320, 2320, 440, 2400, 390);
      midHills.lineTo(2400, 730);
      midHills.lineTo(0, 730);
      midHills.closePath();
      midHills.fill(0x46a46d);

      const ground = new Graphics();
      ground.rect(0, 590, WORLD_WIDTH, WORLD_HEIGHT - 590);
      ground.fill(0x72c66c);

      const grassLight = new Graphics();
      grassLight.ellipse(480, 850, 430, 260);
      grassLight.ellipse(1520, 880, 520, 300);
      grassLight.fill({
        color: 0x99da79,
        alpha: 0.55,
      });

      const river = new Graphics();

      river.moveTo(0, 1040);
      river.bezierCurveTo(420, 895, 670, 1125, 1010, 1010);
      river.bezierCurveTo(1340, 900, 1600, 1110, 1930, 960);
      river.bezierCurveTo(2130, 870, 2280, 890, 2400, 850);
      river.lineTo(2400, 1040);
      river.bezierCurveTo(2150, 1080, 2040, 1080, 1810, 1180);
      river.bezierCurveTo(1430, 1340, 1110, 1160, 760, 1270);
      river.bezierCurveTo(420, 1370, 190, 1210, 0, 1270);
      river.closePath();
      river.fill(0x52bce2);

      const riverHighlight = new Graphics();

      riverHighlight.moveTo(100, 1115);
      riverHighlight.bezierCurveTo(500, 990, 720, 1170, 1090, 1050);
      riverHighlight.bezierCurveTo(1400, 950, 1640, 1130, 1960, 995);

      riverHighlight.stroke({
        width: 10,
        color: 0xcaf4ff,
        alpha: 0.42,
      });

      const path = new Graphics();

      path.moveTo(250, 1030);
      path.bezierCurveTo(450, 890, 520, 760, 740, 805);
      path.bezierCurveTo(950, 845, 1040, 690, 1235, 730);
      path.bezierCurveTo(1430, 770, 1515, 640, 1735, 695);
      path.bezierCurveTo(1930, 745, 2045, 600, 2210, 610);

      path.stroke({
        width: 76,
        color: 0xe7c990,
      });

      const pathEdge = new Graphics();

      pathEdge.moveTo(250, 1030);
      pathEdge.bezierCurveTo(450, 890, 520, 760, 740, 805);
      pathEdge.bezierCurveTo(950, 845, 1040, 690, 1235, 730);
      pathEdge.bezierCurveTo(1430, 770, 1515, 640, 1735, 695);
      pathEdge.bezierCurveTo(1930, 745, 2045, 600, 2210, 610);

      pathEdge.stroke({
        width: 7,
        color: 0xf6e5b8,
        alpha: 0.9,
      });

      world.addChild(
        sky,
        distantHills,
        midHills,
        ground,
        grassLight,
        river,
        riverHighlight,
        path,
        pathEdge,
      );

      const clouds = [
        createCloud(170, 150, 1.05),
        createCloud(720, 118, 0.82),
        createCloud(1370, 175, 1.2),
        createCloud(1990, 120, 0.9),
      ];

      clouds.forEach((cloud) => world.addChild(cloud));

      const houses = [
        createHouse(390, 700, 0xf4cf79, 0xd95d55, 1),
        createHouse(820, 630, 0xdfe3ff, 0x6b5cc8, 0.86),
        createHouse(1430, 595, 0xffd8c4, 0xce5b6f, 0.95),
        createHouse(1840, 565, 0xcfeee5, 0x367e70, 0.88),
      ];

      houses.forEach((house) => world.addChild(house));

      const treePositions = [
        [170, 760, 1.05],
        [265, 670, 0.8],
        [520, 640, 0.75],
        [650, 900, 1],
        [955, 605, 0.8],
        [1090, 910, 1.1],
        [1290, 560, 0.74],
        [1580, 900, 1.05],
        [1690, 530, 0.78],
        [2015, 795, 1.1],
        [2160, 515, 0.85],
        [2260, 760, 0.92],
      ];

      treePositions.forEach(([x, y, scale]) => {
        world.addChild(createTree(x, y, scale));
      });

      const levelPositions = [
        [1, 270, 985],
        [2, 455, 875],
        [3, 665, 805],
        [4, 865, 825],
        [5, 1045, 740],
        [6, 1235, 730],
        [7, 1430, 735],
        [8, 1600, 665],
        [9, 1775, 700],
        [10, 1960, 670],
      ];

      const markers = levelPositions.map(([level, x, y]) => {
        const marker = createLevelMarker(level, x, y);
        world.addChild(marker);
        return marker;
      });

      const arena = createPrizeArena(2210, 590);
      world.addChild(arena);

      const sign = roundedPanel(
        73,
        710,
        290,
        98,
        0x17213d,
        0.93,
      );

      const signTitle = new Text({
        text: 'WELCOME TO',
        style: {
          fontFamily: 'Arial, sans-serif',
          fontSize: 18,
          fontWeight: '700',
          fill: 0xffd85d,
          letterSpacing: 2,
        },
      });

      signTitle.x = 102;
      signTitle.y = 727;

      const signText = new Text({
        text: 'PRIZE LEAGUE WORLD',
        style: {
          fontFamily: 'Arial, sans-serif',
          fontSize: 24,
          fontWeight: '900',
          fill: 0xffffff,
        },
      });

      signText.x = 102;
      signText.y = 754;

      world.addChild(sign, signTitle, signText);

      const player = createPlayer();
      player.x = 225;
      player.y = 962;

      world.addChild(player);

      let elapsed = 0;

      const resizeWorld = () => {
        const rendererWidth = app.renderer.width;
        const rendererHeight = app.renderer.height;

        const scale = Math.max(
          rendererWidth / WORLD_WIDTH,
          rendererHeight / WORLD_HEIGHT,
        );

        world.scale.set(scale);

        const visibleWidth = rendererWidth / scale;
        const visibleHeight = rendererHeight / scale;

        world.x = Math.min(
          0,
          (rendererWidth - WORLD_WIDTH * scale) / 2,
        );

        world.y = Math.max(
          (rendererHeight - WORLD_HEIGHT * scale) / 2,
          rendererHeight - visibleHeight * scale,
        );

        if (rendererWidth < 760) {
          const mobileScale = rendererHeight / WORLD_HEIGHT;

          world.scale.set(mobileScale);
          world.x = 0;
          world.y = 0;
        }
      };

      resizeWorld();

      const resizeObserver = new ResizeObserver(() => {
        resizeWorld();
      });

      resizeObserver.observe(host);

      app.ticker.add((ticker) => {
        const delta = ticker.deltaTime;
        elapsed += delta * 0.035;

        clouds.forEach((cloud, index) => {
          cloud.x += cloud.worldSpeed * delta;

          if (cloud.x > WORLD_WIDTH + 150) {
            cloud.x = -200;
          }

          cloud.y += Math.sin(elapsed + index) * 0.025;
        });

        markers.forEach((marker) => {
          const pulse =
            1 +
            Math.sin(
              elapsed * 2.2 + marker.pulseSeed,
            ) * 0.035;

          marker.scale.set(pulse);
        });

        arena.y = 590 + Math.sin(elapsed * 1.2) * 2;

        player.y =
          962 +
          Math.sin(elapsed * 3.1) * 2;
      });

      app.__worldResizeObserver = resizeObserver;
    };

    start().catch((error) => {
      console.error('[PrizeLeagueWorld] renderer failed:', error);
    });

    return () => {
      destroyed = true;

      if (app?.__worldResizeObserver) {
        app.__worldResizeObserver.disconnect();
      }

      // React development StrictMode can run cleanup before Pixi's
      // asynchronous Application.init() has completed. Destroying a
      // partially initialized Pixi Application causes the resize plugin
      // _cancelResize runtime error.
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
      aria-label="Prize League animated world"
    />
  );
}
