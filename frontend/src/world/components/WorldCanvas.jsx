import { useEffect, useRef } from 'react';
import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
} from 'pixi.js';

const WORLD_WIDTH = 1024;
const WORLD_HEIGHT = 1536;

const HD_WORLD =
  '/world-assets/royal-village/hd/royal-village-hd.png';



const MIN_ZOOM = 0.32;
const MAX_ZOOM = 2.2;

const CURRENT_WORLD_LEVEL = 1;

/*
 * Live-avatar movement engine.
 *
 * The actual character artwork will be supplied as a separate
 * transparent asset. We intentionally do NOT use the old Kenney
 * character here.
 */
const LIVE_AVATAR_ENABLED = true;

/*
 * Road waypoints for Royal Village.
 *
 * These are movement coordinates, separate from the level markers,
 * so the avatar follows the road instead of moving in a straight
 * line through scenery.
 */
const ROYAL_VILLAGE_ROUTE = [
  { x: 510, y: 1405 },

  { x: 505, y: 1365 },
  { x: 510, y: 1325 },
  { x: 510, y: 1292 },

  // Level 1 approach
  { x: 510, y: 1215 },

  { x: 485, y: 1195 },
  { x: 460, y: 1140 },

  // Level 2 approach
  { x: 455, y: 1050 },

  { x: 495, y: 1010 },
  { x: 545, y: 980 },

  // Level 3 approach
  { x: 565, y: 925 },

  { x: 585, y: 875 },

  // Level 4 approach
  { x: 585, y: 795 },

  { x: 560, y: 755 },

  // Level 5 approach
  { x: 535, y: 675 },

  { x: 500, y: 645 },

  // Level 6 approach
  { x: 455, y: 575 },

  // Level 7 approach
  { x: 445, y: 465 },

  { x: 505, y: 440 },

  // Level 8 approach
  { x: 565, y: 375 },

  { x: 550, y: 345 },

  // Level 9 approach
  { x: 525, y: 280 },

  // Level 10 approach
  { x: 510, y: 175 },

  // Champion Arena approach
  { x: 510, y: 125 },
];

const LEVEL_ROUTE_INDEX = {
  1: 4,
  2: 7,
  3: 9,
  4: 11,
  5: 13,
  6: 15,
  7: 16,
  8: 18,
  9: 20,
  10: 21,
};

const DESTINATIONS = [
  // Royal Village — progression follows the visible HD road.
  // Keep nodes away from mobile viewport edges.
  { level: 1, name: 'Village Gate', x: 510, y: 1270 },
  { level: 2, name: 'Market Square', x: 455, y: 1080 },
  { level: 3, name: 'Royal Farm', x: 565, y: 955 },
  { level: 4, name: 'Riverside Trail', x: 585, y: 825 },
  { level: 5, name: "King's Bridge", x: 535, y: 705 },
  { level: 6, name: 'Whispering Woods', x: 455, y: 605 },
  { level: 7, name: 'Ancient Ruins', x: 445, y: 495 },
  { level: 8, name: 'Watchtower Pass', x: 565, y: 405 },
  { level: 9, name: 'Castle Crossing', x: 525, y: 310 },
  { level: 10, name: 'Royal Gate', x: 510, y: 205 },
];

function makeText(text, fontSize, fill = 0xffffff) {
  const label = new Text({
    text,
    style: {
      fontFamily: 'Georgia, Times New Roman, serif',
      fontSize,
      fontWeight: '900',
      fill,
      align: 'center',
      stroke: {
        color: 0x1d120c,
        width: 4,
      },
    },
  });

  label.anchor.set(0.5);
  return label;
}

function createLevelMarker(destination) {
  const root = new Container();

  root.x = destination.x;
  root.y = destination.y;

  const isCurrent =
    destination.level === CURRENT_WORLD_LEVEL;

  const isCompleted =
    destination.level < CURRENT_WORLD_LEVEL;

  const isLocked =
    destination.level > CURRENT_WORLD_LEVEL;

  const glow = new Graphics();
  glow.circle(0, 0, 31);
  glow.fill({
    color: 0xffcc51,
    alpha: 0.28,
  });

  const outer = new Graphics();
  outer.circle(0, 0, 25);
  outer.fill(
    isCompleted
      ? 0x4f9b5f
      : isCurrent
        ? 0xe4b742
        : 0x6e6255,
  );
  outer.stroke({
    width: 3,
    color: 0xffefa4,
  });

  const inner = new Graphics();
  inner.circle(0, 0, 19);
  inner.fill(
    isCompleted
      ? 0x18351f
      : isCurrent
        ? 0x2d1c13
        : 0x2d2925,
  );

  const number = makeText(
    isCompleted
      ? '✓'
      : isLocked
        ? '🔒'
        : String(destination.level),
    isLocked ? 11 : 14,
  );

  const board = new Graphics();
  board.roundRect(
    -58,
    31,
    116,
    29,
    8,
  );

  board.fill({
    color: 0x271810,
    alpha: 0.92,
  });

  board.stroke({
    width: 2,
    color: 0xc49b42,
  });

  const name = makeText(
    destination.name,
    9,
  );

  name.y = 45;

  root.addChild(
    glow,
    outer,
    inner,
    number,
    board,
    name,
  );

  if (isCurrent) {
    const playGlow =
      new Graphics();

    playGlow.roundRect(
      -54,
      58,
      108,
      38,
      14,
    );

    playGlow.fill({
      color: 0xffd65c,
      alpha: 0.24,
    });

    const playButton =
      new Graphics();

    playButton.roundRect(
      -50,
      60,
      100,
      34,
      13,
    );

    playButton.fill({
      color: 0xe9bd4d,
      alpha: 0.98,
    });

    playButton.stroke({
      width: 2,
      color: 0xffefad,
    });

    const playText =
      makeText(
        '▶ PLAY',
        12,
        0x2d1c13,
      );

    playText.y = 77;

    const playHit =
      new Container();

    playHit.addChild(
      playGlow,
      playButton,
      playText,
    );

    playHit.eventMode = 'static';
    playHit.cursor = 'pointer';

    playHit.on(
      'pointertap',
      (event) => {
        event.stopPropagation();

        window.dispatchEvent(
          new CustomEvent(
            'pl-world-level-select',
            {
              detail: {
                level: destination.level,
                name: destination.name,
              },
            },
          ),
        );
      },
    );

    root.addChild(playHit);

    // PLAY becomes visible only when the avatar reaches
    // the current destination.
    playHit.visible = false;

    root.__playGlow = playGlow;
    root.__playHit = playHit;
  }

  root.__glow = glow;

  root.eventMode =
    isLocked
      ? 'none'
      : 'static';

  root.cursor =
    isLocked
      ? 'default'
      : 'pointer';

  if (!isLocked) {
    root.on(
      'pointertap',
      () => {
        window.dispatchEvent(
          new CustomEvent(
            'pl-world-level-select',
            {
              detail: {
                level: destination.level,
                name: destination.name,
              },
            },
          ),
        );
      },
    );
  }

  return root;
}

function createChampionArena() {
  const root = new Container();

  root.x = 510;
  root.y = 110;

  const halo = new Graphics();

  halo.circle(
    0,
    0,
    108,
  );

  halo.fill({
    color: 0xffcf58,
    alpha: 0.10,
  });

  const glow = new Graphics();

  glow.circle(
    0,
    0,
    82,
  );

  glow.fill({
    color: 0xffc83c,
    alpha: 0.20,
  });

  const crown = makeText(
    '♛',
    31,
    0xffdc6f,
  );

  crown.y = -68;

  const boardShadow =
    new Graphics();

  boardShadow.roundRect(
    -155,
    -44,
    310,
    94,
    17,
  );

  boardShadow.fill({
    color: 0x000000,
    alpha: 0.32,
  });

  boardShadow.y = 7;

  const board =
    new Graphics();

  board.roundRect(
    -155,
    -47,
    310,
    94,
    17,
  );

  board.fill({
    color: 0x21120d,
    alpha: 0.97,
  });

  board.stroke({
    width: 5,
    color: 0xe5bc4e,
  });

  const innerBorder =
    new Graphics();

  innerBorder.roundRect(
    -145,
    -37,
    290,
    74,
    13,
  );

  innerBorder.stroke({
    width: 2,
    color: 0xffe59a,
    alpha: 0.68,
  });

  const title = makeText(
    'CHAMPION ARENA I',
    16,
    0xffe294,
  );

  title.y = -23;

  const prize = makeText(
    '£100',
    30,
    0xffffff,
  );

  prize.y = 4;

  const prizeLabel =
    makeText(
      'CHAMPION PRIZE',
      10,
      0xffdd79,
    );

  prizeLabel.y = 29;

  const leftStar =
    makeText(
      '✦',
      16,
      0xffd65f,
    );

  leftStar.x = -122;
  leftStar.y = 2;

  const rightStar =
    makeText(
      '✦',
      16,
      0xffd65f,
    );

  rightStar.x = 122;
  rightStar.y = 2;

  root.addChild(
    halo,
    glow,
    crown,
    boardShadow,
    board,
    innerBorder,
    title,
    prize,
    prizeLabel,
    leftStar,
    rightStar,
  );

  root.__halo = halo;
  root.__glow = glow;
  root.__crown = crown;
  root.__leftStar = leftStar;
  root.__rightStar = rightStar;

  return root;
}

function createSeasonPrizeBanner() {
  const root = new Container();

  root.x = 510;
  root.y = 1435;

  const panel = new Graphics();

  panel.roundRect(
    -208,
    -54,
    416,
    108,
    18,
  );

  panel.fill({
    color: 0x27170f,
    alpha: 0.95,
  });

  panel.stroke({
    width: 4,
    color: 0xd7a943,
  });

  const title = makeText(
    'PRIZE LEAGUE WORLD • SEASON 1',
    12,
    0xf6d77d,
  );

  title.y = -31;

  const amount = makeText(
    'UP TO £127,500',
    25,
  );

  amount.y = -1;

  const subtitle = makeText(
    'IN SEASON PRIZES',
    13,
    0xffe9af,
  );

  subtitle.y = 24;

  const meta = makeText(
    '500 LEVELS • 50 CHAMPION ARENAS',
    9,
    0xe9cf8a,
  );

  meta.y = 43;

  root.addChild(
    panel,
    title,
    amount,
    subtitle,
    meta,
  );

  return root;
}

export default function WorldCanvas() {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return undefined;
    }

    let app = null;
    let initialized = false;
    let destroyed = false;

    let world = null;

    let arena = null;

    let zoom = 1;

    let dragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let worldStartX = 0;
    let worldStartY = 0;

    const activePointers = new Map();

    let pinchStartDistance = null;
    let pinchStartZoom = null;

    const markers = [];

    let liveAvatar = null;

    let avatarRoutePosition = {
      x: ROYAL_VILLAGE_ROUTE[0].x,
      y: ROYAL_VILLAGE_ROUTE[0].y,
    };

    let avatarRouteIndex = 0;

    let avatarMoving = false;
    let avatarArrived = false;

    let currentMarker = null;

    const AVATAR_SPEED = 165;
    const arenaParticles = [];

    const clampWorld = () => {
      if (!app || !world) return;

      const width = app.renderer.width;
      const height = app.renderer.height;

      const scaledWidth =
        WORLD_WIDTH * zoom;

      const scaledHeight =
        WORLD_HEIGHT * zoom;

      const margin = 70;

      world.x = Math.min(
        margin,
        Math.max(
          width - scaledWidth - margin,
          world.x,
        ),
      );

      world.y = Math.min(
        margin,
        Math.max(
          height - scaledHeight - margin,
          world.y,
        ),
      );
    };

    const setFocus = (
      x,
      y,
      targetZoom,
      verticalPosition = 0.62,
    ) => {
      zoom = Math.max(
        MIN_ZOOM,
        Math.min(
          MAX_ZOOM,
          targetZoom,
        ),
      );

      world.scale.set(zoom);

      world.x =
        app.renderer.width / 2 -
        x * zoom;

      world.y =
        app.renderer.height *
          verticalPosition -
        y * zoom;

      clampWorld();
    };

    const revealCurrentPlay = () => {
      if (
        currentMarker?.__playHit
      ) {
        currentMarker.__playHit.visible =
          true;
      }
    };

    const hideCurrentPlay = () => {
      if (
        currentMarker?.__playHit
      ) {
        currentMarker.__playHit.visible =
          false;
      }
    };

    const focusOnAvatar = () => {
      if (!app || !world) {
        return;
      }

      const mobile =
        app.renderer.width <=
        760;

      const desiredX =
        app.renderer.width / 2;

      const desiredY =
        app.renderer.height *
        (
          mobile
            ? 0.62
            : 0.60
        );

      const targetX =
        desiredX -
        avatarRoutePosition.x *
        zoom;

      const targetY =
        desiredY -
        avatarRoutePosition.y *
        zoom;

      // Smooth camera following rather than snapping.
      world.x +=
        (
          targetX -
          world.x
        ) * 0.075;

      world.y +=
        (
          targetY -
          world.y
        ) * 0.075;

      clampWorld();
    };

    const beginAvatarJourney = () => {
      const destinationRouteIndex =
        LEVEL_ROUTE_INDEX[
          CURRENT_WORLD_LEVEL
        ];

      if (
        destinationRouteIndex ===
        undefined
      ) {
        revealCurrentPlay();
        return;
      }

      avatarRouteIndex = 0;
      avatarMoving = true;
      avatarArrived = false;

      hideCurrentPlay();

      avatarRoutePosition = {
        x: ROYAL_VILLAGE_ROUTE[0].x,
        y: ROYAL_VILLAGE_ROUTE[0].y,
      };

      if (liveAvatar) {
        liveAvatar.x =
          avatarRoutePosition.x;

        liveAvatar.y =
          avatarRoutePosition.y;
      }
    };

    const updateAvatarJourney = (
      deltaSeconds,
    ) => {
      if (
        !avatarMoving ||
        avatarArrived
      ) {
        return;
      }

      const destinationRouteIndex =
        LEVEL_ROUTE_INDEX[
          CURRENT_WORLD_LEVEL
        ];

      if (
        avatarRouteIndex >=
        destinationRouteIndex
      ) {
        avatarMoving = false;
        avatarArrived = true;

        revealCurrentPlay();
        return;
      }

      const nextWaypoint =
        ROYAL_VILLAGE_ROUTE[
          avatarRouteIndex + 1
        ];

      if (!nextWaypoint) {
        avatarMoving = false;
        avatarArrived = true;

        revealCurrentPlay();
        return;
      }

      const dx =
        nextWaypoint.x -
        avatarRoutePosition.x;

      const dy =
        nextWaypoint.y -
        avatarRoutePosition.y;

      const distance =
        Math.hypot(
          dx,
          dy,
        );

      const movement =
        AVATAR_SPEED *
        deltaSeconds;

      if (
        distance <= movement ||
        distance < 0.5
      ) {
        avatarRoutePosition = {
          x: nextWaypoint.x,
          y: nextWaypoint.y,
        };

        avatarRouteIndex += 1;
      } else {
        avatarRoutePosition = {
          x:
            avatarRoutePosition.x +
            (
              dx /
              distance
            ) *
            movement,

          y:
            avatarRoutePosition.y +
            (
              dy /
              distance
            ) *
            movement,
        };
      }

      if (liveAvatar) {
        liveAvatar.x =
          avatarRoutePosition.x;

        liveAvatar.y =
          avatarRoutePosition.y;

        const direction =
          dx >= 0
            ? 1
            : -1;

        liveAvatar.scale.x =
          Math.abs(
            liveAvatar.scale.x
          ) * direction;
      }

      focusOnAvatar();
    };

    const focusStart = () => {
      const mobile =
        app.renderer.width <= 760;

      setFocus(
        DESTINATIONS[0].x,
        DESTINATIONS[0].y,
        mobile ? 1.05 : 0.78,
        mobile ? 0.64 : 0.66,
      );
    };

    const fitOverview = () => {
      zoom = Math.min(
        app.renderer.width /
          WORLD_WIDTH,
        app.renderer.height /
          WORLD_HEIGHT,
      ) * 0.96;

      zoom = Math.max(
        MIN_ZOOM,
        zoom,
      );

      world.scale.set(zoom);

      world.x =
        (
          app.renderer.width -
          WORLD_WIDTH * zoom
        ) / 2;

      world.y =
        (
          app.renderer.height -
          WORLD_HEIGHT * zoom
        ) / 2;

      clampWorld();
    };

    const applyZoom = (
      nextZoom,
      pointerX,
      pointerY,
    ) => {
      const previousZoom = zoom;

      zoom = Math.max(
        MIN_ZOOM,
        Math.min(
          MAX_ZOOM,
          nextZoom,
        ),
      );

      const mapX =
        (
          pointerX -
          world.x
        ) /
        previousZoom;

      const mapY =
        (
          pointerY -
          world.y
        ) /
        previousZoom;

      world.scale.set(zoom);

      world.x =
        pointerX -
        mapX * zoom;

      world.y =
        pointerY -
        mapY * zoom;

      clampWorld();
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

      host.appendChild(
        app.canvas,
      );

      const [
        mapTexture,

      ] = await Promise.all([
        Assets.load(HD_WORLD),

      ]);

      if (destroyed) return;

      world = new Container();

      app.stage.addChild(world);

      const background =
        new Sprite(mapTexture);

      background.anchor.set(0);

      background.width =
        WORLD_WIDTH;

      background.height =
        WORLD_HEIGHT;

      world.addChild(background);

      DESTINATIONS.forEach(
        (destination) => {
          const marker =
            createLevelMarker(
              destination,
            );

          markers.push(marker);

          if (
            destination.level ===
            CURRENT_WORLD_LEVEL
          ) {
            currentMarker = marker;
          }

          world.addChild(marker);
        },
      );

      arena =
        createChampionArena();

      world.addChild(arena);

      /*
       * Live avatar container.
       *
       * This container is ready for a premium transparent avatar
       * asset. We deliberately leave it visually empty until that
       * asset exists.
       */
      liveAvatar =
        new Container();

      liveAvatar.x =
        avatarRoutePosition.x;

      liveAvatar.y =
        avatarRoutePosition.y;

      liveAvatar.eventMode =
        'none';

      /*
       * Temporary movement-test marker only.
       * This is NOT the final avatar.
       * It proves the route + camera + arrival logic.
       */
      const avatarShadow =
        new Graphics();

      avatarShadow.ellipse(
        0,
        4,
        15,
        6,
      );

      avatarShadow.fill({
        color: 0x000000,
        alpha: 0.28,
      });

      const avatarBody =
        new Graphics();

      avatarBody.circle(
        0,
        -18,
        8,
      );

      avatarBody.fill(
        0xd9b26f,
      );

      avatarBody.roundRect(
        -7,
        -10,
        14,
        24,
        6,
      );

      avatarBody.fill(
        0x224c78,
      );

      const avatarLegs =
        new Graphics();

      avatarLegs.rect(
        -6,
        12,
        4,
        14,
      );

      avatarLegs.rect(
        2,
        12,
        4,
        14,
      );

      avatarLegs.fill(
        0x2c241d,
      );

      liveAvatar.addChild(
        avatarShadow,
        avatarLegs,
        avatarBody,
      );

      liveAvatar.scale.set(
        1.15,
      );

      world.addChild(
        liveAvatar,
      );

      if (!LIVE_AVATAR_ENABLED) {
        liveAvatar.visible = false;
      }

      // Decorative Champion Arena sparkles.
      // These are promotional environmental effects only.
      for (let i = 0; i < 14; i += 1) {
        const sparkle =
          new Graphics();

        sparkle.circle(
          0,
          0,
          2 + (i % 3),
        );

        sparkle.fill({
          color:
            i % 3 === 0
              ? 0xffffff
              : 0xffd45e,
          alpha: 0.8,
        });

        sparkle.x =
          510 +
          Math.cos(
            (Math.PI * 2 * i) /
              14,
          ) *
            (
              95 +
              (i % 4) * 12
            );

        sparkle.y =
          110 +
          Math.sin(
            (Math.PI * 2 * i) /
              14,
          ) *
            (
              65 +
              (i % 3) * 10
            );

        sparkle.__seed =
          i * 0.73;

        sparkle.__baseX =
          sparkle.x;

        sparkle.__baseY =
          sparkle.y;

        arenaParticles.push(
          sparkle,
        );

        world.addChild(
          sparkle,
        );
      }



      focusStart();

      window.setTimeout(
        () => {
          beginAvatarJourney();
        },
        450,
      );

      const handleStart = () => {
        focusStart();
      };

      const handleOverview = () => {
        fitOverview();
      };

      const handleZoomIn = () => {
        applyZoom(
          zoom * 1.18,
          app.renderer.width / 2,
          app.renderer.height / 2,
        );
      };

      const handleZoomOut = () => {
        applyZoom(
          zoom * 0.84,
          app.renderer.width / 2,
          app.renderer.height / 2,
        );
      };

      window.addEventListener(
        'pl-world-start',
        handleStart,
      );

      window.addEventListener(
        'pl-world-overview',
        handleOverview,
      );

      window.addEventListener(
        'pl-world-zoom-in',
        handleZoomIn,
      );

      window.addEventListener(
        'pl-world-zoom-out',
        handleZoomOut,
      );

      app.__worldCleanup = () => {
        window.removeEventListener(
          'pl-world-start',
          handleStart,
        );

        window.removeEventListener(
          'pl-world-overview',
          handleOverview,
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

            worldStartX =
              world.x;

            worldStartY =
              world.y;
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
            activePointers.size !==
              1
          ) {
            return;
          }

          world.x =
            worldStartX +
            event.clientX -
            dragStartX;

          world.y =
            worldStartY +
            event.clientY -
            dragStartY;

          clampWorld();
        },
      );

      const stopPointer =
        (event) => {
          activePointers.delete(
            event.pointerId,
          );

          if (
            activePointers.size < 2
          ) {
            pinchStartDistance = null;
            pinchStartZoom = null;
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

          updateAvatarJourney(
            Math.max(
              0,
              Number(
                ticker.deltaMS ||
                16.67
              ) / 1000,
            ),
          );

          markers.forEach(
            (marker, index) => {
              const pulse =
                1 +
                Math.sin(
                  elapsed * 2 +
                    index * 0.7,
                ) *
                  0.025;

              marker.__glow.scale.set(
                pulse,
              );

              if (marker.__playGlow) {
                const playPulse =
                  1 +
                  Math.sin(
                    elapsed * 3,
                  ) *
                    0.05;

                marker.__playGlow.scale.set(
                  playPulse,
                );
              }
            },
          );

          if (
            liveAvatar &&
            avatarMoving
          ) {
            liveAvatar.rotation =
              Math.sin(
                elapsed * 8,
              ) *
                0.025;

            liveAvatar.y =
              avatarRoutePosition.y +
              Math.abs(
                Math.sin(
                  elapsed * 8,
                ),
              ) *
                2.5;
          } else if (liveAvatar) {
            liveAvatar.rotation = 0;
            liveAvatar.y =
              avatarRoutePosition.y;
          }

          if (arena) {
            const pulse =
              1 +
              Math.sin(
                elapsed * 2,
              ) *
                0.04;

            const haloPulse =
              1 +
              Math.sin(
                elapsed * 1.35,
              ) *
                0.07;

            arena.__glow.scale.set(
              pulse,
            );

            arena.__halo.scale.set(
              haloPulse,
            );

            arena.__crown.y =
              -68 +
              Math.sin(
                elapsed * 2.3,
              ) *
                2.5;

            arena.__leftStar.rotation =
              elapsed * 0.6;

            arena.__rightStar.rotation =
              -elapsed * 0.6;
          }

          arenaParticles.forEach(
            (particle) => {
              particle.alpha =
                0.35 +
                (
                  Math.sin(
                    elapsed * 3 +
                      particle.__seed,
                  ) +
                  1
                ) *
                  0.3;

              particle.x =
                particle.__baseX +
                Math.sin(
                  elapsed * 1.8 +
                    particle.__seed,
                ) *
                  4;

              particle.y =
                particle.__baseY +
                Math.cos(
                  elapsed * 1.6 +
                    particle.__seed,
                ) *
                  4;
            },
          );

        },
      );
    };

    start().catch(
      (error) => {
        console.error(
          '[PrizeLeagueWorld] HD environment failed:',
          error,
        );
      },
    );

    return () => {
      destroyed = true;

      if (
        app?.__worldCleanup
      ) {
        app.__worldCleanup();
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
      aria-label="Prize League HD Royal Village"
    />
  );
}
