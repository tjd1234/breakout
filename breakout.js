// breakout.js

//
// Bugs to fix:
// ...
//
// Bugs fixed:
// ...

//
// To do:
// - add levels, i.e. after all bricks are cleared, increment the level (maybe
//   with a bonus) and reset the bricks
// - add particle system for brick hits (maybe make it a component so that it
//   can be re-used for other things)
// - make the bricks fit the screen better
// - instead of adding/removing spawn component, reset the spawn each time when
//   needed
// - conditional events, how best to handle?

//
// Notes
// =====
//
// This is an experiment in using the Entity Component System (ECS)
// architecture. I used Cursor and DeepSeek to generate code and learn ECS.
//
// Initially implemented bricks as an array of entity IDs. However,
// adding/removing bricks from the game bricks array was a pain since it had to
// be consistent with the world state. So I switched to leaving the brick
// entities in the world at all times, and setting their "shape.show" property
// to false when they are hit. This simplifies a lot of code. In the future, it
// might make sense to create a "brick set" entity or component, that manages
// the bricks in a more modular way.
//
// A nasty bug was the when the ball was invisible it was still on the screen
// and so would hit two of the bricks. Took a long time to figure that out, with
// a lot of debugging code added and time in the Chrome JS debugger. Could have
// been avoided with a more sensible default value for bricks (it was (100, 100)
// for some reason).
//
// Timer management is a bit of a mess. I'm not sure how to handle it better.
// Instead of adding/removing timers, keep timers around that we know we need
// (e.g. level respawn timers), and reset them when needed.
//

//
// general helper code
//
function dotAt(x, y, size, color) {
    push();
    ellipseMode(CENTER);
    fill(color);
    noStroke();
    ellipse(x, y, size, size);
    pop();
}

function redDotAt(x, y) {
    dotAt(x, y, 5, "red");
}

function greenDotAt(x, y) {
    dotAt(x, y, 5, "green");
}

function randSign() {
    return random(0, 1) < 0.5 ? 1 : -1;
}

function wrapCoordinate(value, max) {
    if (value < 0) return max - 1;
    if (value >= max) return 0;
    return value;
}

function error(msg) {
    throw new Error(msg);
}

//
// constants
//
const PLAYFIELD = {
    width: 400,
    height: 400,
};

//
// ECS support code
//

// an entity is a unique numeric ID for each object in the game; we attach
// components to entities as needed to give desired behavior
let nextEntityId = 0;
function getNewEntityId() {
    return nextEntityId++;
}

// the world is a map of entityID:components pairs
const world = new Map();

function createEntity(name = "<unnamed>") {
    const eid = getNewEntityId();
    const components = new Map();
    // all components have a name, to help with debugging
    components.set("name", { name });
    world.set(eid, components);
    return eid;
}

function getName(eid) {
    const comp = getComponent(eid, "name");
    if (!comp) {
        error(`getName: entity ${eid} does not have a name`);
    }
    return comp.name;
}

function addComponent(eid, compName, data) {
    // validate inputs
    if (compName == null || typeof compName !== "string") {
        error("addComponent: componentName must be a non-null string");
    }
    if (data == null) {
        error("addComponent: data cannot be null");
    }

    const allComponents = world.get(eid);
    if (!allComponents) {
        error(`addComponent: entity ${eid} not found`);
    }

    // Check if component already exists
    if (allComponents.has(compName)) {
        error(
            `addComponent: entity ${eid} already has component "${compName}"`
        );
    }

    allComponents.set(compName, data);
    return eid;
}

function removeComponent(eid, compName) {
    // get the entity from the world, and check that it exists
    const allComponents = world.get(eid);

    if (!allComponents) {
        error(`removeComponent: entity ID ${eid} not found`);
    }

    // get the components from the entity, and check that it exists
    const comp = allComponents.get(compName);
    if (!comp) {
        const name = getName(eid);
        error(
            `removeComponent: entity ${eid}=${name} does not have component "${compName}"`
        );
    }

    allComponents.delete(compName);
    return eid;
}

function getComponent(eid, compName) {
    // get the entity from the world, and check that it exists
    const allComponents = world.get(eid);
    if (!allComponents) {
        error(`getComponent: entity ID ${eid} not found`);
    }
    // get the component from the entity, and check that it exists
    const comp = allComponents.get(compName);
    if (!comp) {
        const name = getName(eid);
        error(
            `getComponent: Entity ${eid}=${name} exists but does not have component "${compName}"`
        );
    }
    return comp;
}

//
// factory functions for components
//

function makeVelocity(dx = 0, dy = 0, speed = 1) {
    return { dx, dy, speed };
}

function makePosition(x = 0, y = 0, show = false) {
    return { x, y, show };
}

function makeBoundedByRect(
    bounds = { x: 0, y: 0, width: PLAYFIELD.width, height: PLAYFIELD.height },
    onBottomHit = () => {}
) {
    return {
        bounds,
        onBottomHit,
    };
}

function makeShape(
    fill = "white",
    stroke = "black",
    width = 10,
    height = 10,
    shape = "rect",
    show = true,
    showPosition = false,
    showBoundingBox = false
) {
    return {
        fill,
        stroke,
        width,
        height,
        shape,
        show,
        showPosition,
        showBoundingBox,
    };
} // makeRender

function makeText(text = "<text>") {
    return {
        text,
        show: true,
        fontSize: 12,
        font: "Arial",
        color: "black",
    };
} // makeText

function makeMouseControl(offsetY = 30) {
    return {
        offsetY, // height of paddle from bottom of screen
        active: true, // can be used to temporarily disable mouse control
    };
}

// doOnRespawn is a function that is called when the entity is respawned
function makeRespawn(respawnDelayMS = 1500, doOnRespawn = () => {}) {
    return {
        deathTime: 0,
        respawnDelayMS,
        doOnRespawn,
    };
}

function makeDoOnHit(doOnHit = () => {}) {
    return {
        doOnHit,
    };
}

function makeTrigger(doOnTrigger = () => {}) {
    return {
        doOnTrigger,
    };
}

function initBall() {
    const vel = getComponent(ball, "velocity");
    const maxAngle = 75;
    const angle = radians(random(-maxAngle, maxAngle));
    vel.dx = sin(angle);
    vel.dy = cos(angle);
    vel.speed = random(4, 8);

    const render = getComponent(ball, "shape");
    render.show = true;

    const pos = getComponent(ball, "position");
    pos.x = PLAYFIELD.width / 2 - render.width / 2;
    pos.y = PLAYFIELD.height / 2 - render.height / 2;

    // Remove existing respawn component if it exists
    if (world.get(ball).has("respawn")) {
        removeComponent(ball, "respawn");
    }

    // Add a brief delay before starting movement
    addComponent(
        ball,
        "respawn",
        makeRespawn(1000, () => {
            const maxAngle = 75;
            const angle = radians(random(-maxAngle, maxAngle));
            vel.dx = sin(angle);
            vel.dy = cos(angle);
            vel.speed = random(4, 8);

            // Set state back to playing after respawn delay
            const state = getComponent(game, "state");
            state.state = "playing";
        })
    );
} // initBall

function randBrickColor() {
    const colors = ["red", "green", "blue", "yellow", "purple", "orange"];
    return colors[floor(random(colors.length))];
}

//
// explosion particle system
//

function makeParticle(x, y) {
    const angle = random(0, TWO_PI);
    const speed = random(2, 5);
    return {
        x: x,
        y: y,
        dx: cos(angle) * speed,
        dy: sin(angle) * speed,
        alpha: 1.0,
        size: random(2, 4),
        createdAt: millis(),
    };
}

function makeExplosion(x, y, color = "black", numParticles = 10) {
    const particles = [];
    for (let i = 0; i < numParticles; i++) {
        particles.push(makeParticle(x, y));
    }
    return {
        x,
        y,
        color,
        numParticles,
        particles,
        lifeTimeMS: 500, // how long the explosion lasts
        doOnExpire: () => {},
    };
}

//
// systems
//
function movementSystem() {
    for (const [entity, components] of world) {
        // Skip if entity is respawning
        if (components.has("respawn")) continue;

        // Move any entity that has both velocity and position
        if (components.has("velocity") && components.has("position")) {
            const vel = getComponent(entity, "velocity");
            const pos = getComponent(entity, "position");

            pos.x += vel.dx * vel.speed;
            pos.y += vel.dy * vel.speed;
        }
    }
} // movementSystem

// New system to handle rectangular boundaries
function boundarySystem() {
    for (const [entity, components] of world) {
        if (
            components.has("boundedByRect") &&
            components.has("position") &&
            components.has("velocity") &&
            components.has("shape")
        ) {
            const bound = getComponent(entity, "boundedByRect");
            const pos = getComponent(entity, "position");
            const vel = getComponent(entity, "velocity");
            const render = getComponent(entity, "shape");

            // Skip if entity is dead
            if (components.has("respawn")) {
                continue;
            }

            // Check left/right boundaries
            if (
                pos.x <= bound.bounds.x ||
                pos.x + render.width >= bound.bounds.x + bound.bounds.width
            ) {
                vel.dx *= -1;
                // Prevent sticking to walls
                pos.x = Math.max(
                    bound.bounds.x,
                    Math.min(
                        pos.x,
                        bound.bounds.x + bound.bounds.width - render.width
                    )
                );
            }

            // Check top boundary
            if (pos.y <= bound.bounds.y) {
                vel.dy *= -1;
                pos.y = bound.bounds.y;
            }
            // Check bottom boundary
            else if (
                pos.y + render.height >=
                bound.bounds.y + bound.bounds.height
            ) {
                bound.onBottomHit();
            }
        }
    } // for
} // boundarySystem

function renderSystem() {
    rectMode(CORNER);
    ellipseMode(CORNER);

    // find all entities that have both renderable and position components
    for (const [entity, components] of world) {
        if (components.has("shape") && components.has("position")) {
            const shape = getComponent(entity, "shape");
            const pos = getComponent(entity, "position");
            if (shape.show) {
                push();
                fill(shape.fill);
                stroke(shape.stroke);
                // noStroke();
                if (shape.shape === "rect") {
                    rect(pos.x, pos.y, shape.width, shape.height);
                } else if (shape.shape === "circle") {
                    ellipse(pos.x, pos.y, shape.width, shape.height);
                }
                if (shape.showPosition) {
                    redDotAt(pos.x, pos.y);
                }
                if (pos.show) {
                    redDotAt(pos.x + shape.width / 2, pos.y + shape.height / 2);
                }
                if (shape.showBoundingBox) {
                    noFill();
                    stroke(255, 0, 0);
                    strokeWeight(0.5);
                    rect(pos.x, pos.y, shape.width, shape.height);
                }
                pop();
            } // if
        } // if
    } // for
} // renderSystem

function mouseControlSystem() {
    for (const [entity, components] of world) {
        if (
            components.has("mouseControl") &&
            components.has("position") &&
            components.has("shape")
        ) {
            const mouse = getComponent(entity, "mouseControl");
            const pos = getComponent(entity, "position");
            const render = getComponent(entity, "shape");

            if (mouse.active) {
                // Update x position to follow mouse
                pos.x = mouseX - render.width / 2;

                // constrain to playfield, allowing to go a little beyond edges
                const pctPaddleOffScreen = 0.75;
                pos.x = constrain(
                    pos.x,
                    -pctPaddleOffScreen * render.width,
                    PLAYFIELD.width -
                        render.width +
                        pctPaddleOffScreen * render.width
                );

                // set y position relative to bottom of playfield
                pos.y = PLAYFIELD.height - mouse.offsetY;
            }
        }
    } // for
} // mouseControlSystem

function collisionSystem() {
    // if the ball is not visible, skip collision checks
    const ballRender = getComponent(ball, "shape");
    if (!ballRender.show) return;

    // Get ball components
    const ballPos = getComponent(ball, "position");
    const ballVel = getComponent(ball, "velocity");
    // const ballRender = getComponent(ball, "shape");

    // Get paddle components
    const paddlePos = getComponent(paddle, "position");
    const paddleRender = getComponent(paddle, "shape");

    // Check brick collisions
    const bricksComponent = getComponent(game, "bricks");
    for (const brickId of bricksComponent.bricks) {
        const brickPos = getComponent(brickId, "position");
        const brickRender = getComponent(brickId, "shape");

        // Check collision with brick
        if (
            brickRender.show &&
            ballPos.y + ballRender.height >= brickPos.y &&
            ballPos.y <= brickPos.y + brickRender.height &&
            ballPos.x + ballRender.width >= brickPos.x &&
            ballPos.x <= brickPos.x + brickRender.width
        ) {
            // call the destroy callback on the brick
            getComponent(brickId, "brickHitTrigger").doOnHit();

            // bounce the ball (reverse vertical direction)
            ballVel.dy *= -1;

            // Only handle one collision per frame
            break;
        }
    } // for

    // check if all bricks destroyed
    getComponent(game, "allBricksDestroyed").doOnTrigger();

    // Check if ball intersects with paddle
    if (
        ballPos.y + ballRender.height >= paddlePos.y &&
        ballPos.y <= paddlePos.y + paddleRender.height &&
        ballPos.x + ballRender.width >= paddlePos.x &&
        ballPos.x <= paddlePos.x + paddleRender.width
    ) {
        const stats = getComponent(paddle, "stats");
        stats.hits++;

        // Calculate current velocity magnitude
        const currentSpeed = Math.sqrt(
            ballVel.dx * ballVel.dx + ballVel.dy * ballVel.dy
        );

        // Reverse vertical direction
        ballVel.dy = -Math.abs(ballVel.dy);

        // Ensure ball doesn't get stuck in paddle by moving it above
        ballPos.y = paddlePos.y - ballRender.height;

        // Calculate new horizontal influence based on where ball hits paddle
        const hitPosition =
            ballPos.x +
            ballRender.width / 2 -
            (paddlePos.x + paddleRender.width / 2);
        const maxDeflection = 0.75;

        // Set new dx based on hit position
        ballVel.dx =
            (hitPosition / (paddleRender.width / 2)) * Math.abs(ballVel.dy);

        // Normalize to maintain original speed
        const newSpeed = Math.sqrt(
            ballVel.dx * ballVel.dx + ballVel.dy * ballVel.dy
        );
        const speedFactor = currentSpeed / newSpeed;
        ballVel.dx *= speedFactor;
        ballVel.dy *= speedFactor;
    } // if
} // collisionSystem

function respawnSystem() {
    for (const [entity, components] of world) {
        if (components.has("respawn") && components.has("shape")) {
            const respawn = getComponent(entity, "respawn");
            const render = getComponent(entity, "shape");

            console.assert(components.has("respawn"));
            console.assert(components.has("shape"));

            const elapsed = millis() - respawn.deathTime;
            if (elapsed >= respawn.respawnDelayMS) {
                respawn.doOnRespawn();
                render.show = true;
                removeComponent(entity, "respawn");
            }
        }
    } // for
} // respawnSystem

function scoreDisplaySystem() {
    // (scoreX, scoreY) is the start of the score board on top of the screen
    const pos = getComponent(scoreBoard, "position");

    fill(0);

    // show score
    const score = getComponent(game, "score");
    text(`Score: ${score.score}`, pos.x, pos.y);

    // show lives
    const lives = getComponent(game, "lives");
    text(`Lives: ${lives.lives}`, pos.x + 100, pos.y);

    // show level
    const level = getComponent(game, "level");
    text(`Level: ${level.level}`, pos.x + 200, pos.y);
} // scoreDisplaySystem

let pauseKeyPressed = false;
function keyHandlingSystem() {
    if (keyIsPressed && (key === "p" || key === "P")) {
        // Only toggle pause state on the first frame the key is pressed
        if (!pauseKeyWasPressed) {
            const state = getComponent(game, "state");
            state.state = state.state === "paused" ? "playing" : "paused";
            pauseKeyWasPressed = true;
        }
    } else {
        pauseKeyWasPressed = false;
    }
} // keyHandlingSystem

function explosionSystem() {
    for (const [entity, components] of world) {
        if (components.has("explosion")) {
            const exp = getComponent(entity, "explosion");
            const currentTime = millis();

            // Update each particle
            for (const particle of exp.particles) {
                // Update position
                particle.x += particle.dx;
                particle.y += particle.dy;

                // Update alpha based on lifetime
                const particleAge = currentTime - particle.createdAt;
                particle.alpha = 1.0 - particleAge / exp.lifeTimeMS;
            }

            // Remove expired particles
            exp.particles = exp.particles.filter(
                (p) => millis() - p.createdAt < exp.lifeTimeMS
            );

            // Draw particles
            push();
            noStroke();
            for (const particle of exp.particles) {
                // fill(255, 0, 0, particle.alpha * 255); // Red particles
                const c = color(exp.color);
                c.setAlpha(particle.alpha * 255);
                fill(c);
                circle(particle.x, particle.y, particle.size);
            }
            pop();

            // If all particles are gone, remove explosion component
            if (exp.particles.length === 0) {
                exp.doOnExpire();
                removeComponent(entity, "explosion");
            }
        } // if
    } // for
} // explosionSystem

// create all the core entities
let game = null;
let paddle = null;
let ball = null;
let scoreBoard = null;

// This is only meant to be called once, at the start of the program. The game,
// ball, paddle, and scoreBoard are created here and are never deleted.
function createCoreEntities() {
    console.log("=== Starting createCoreEntities ===");

    //
    // make sure the world starts empty
    //
    world.clear();
    nextEntityId = 0;

    //
    // the game
    //
    game = createEntity("game");
    addComponent(game, "score", { score: 0 });
    addComponent(game, "lives", { lives: 3 });
    addComponent(game, "level", { level: 1 });
    addComponent(game, "bricks", { bricks: [] });

    // states: playing, paused, gameOver, respawning
    addComponent(game, "state", { state: "playing" });
    addComponent(
        game,
        "allBricksDestroyed",
        makeTrigger(() => {
            const bricks = getComponent(game, "bricks");
            // if all the bricks are invisible, then the game is over
            let allBricksDestroyed = bricks.bricks.every(
                (brickId) => !getComponent(brickId, "shape").show
            );
            if (allBricksDestroyed) {
                const state = getComponent(game, "state");
                state.state = "respawning";
                const level = getComponent(game, "level");
                level.level++;

                // add a bonus for destroying all the bricks
                const score = getComponent(game, "score");
                score.score += 100;

                // Reset all bricks to visible
                const bricks = getComponent(game, "bricks");
                for (const brickId of bricks.bricks) {
                    const render = getComponent(brickId, "shape");
                    render.show = true;
                    render.fill = randBrickColor();
                }

                // Hide the ball and reinitialize it
                getComponent(ball, "shape").show = false;
                // initBall();
                addComponent(
                    ball,
                    "respawn",
                    makeRespawn(1500, () => {
                        initBall();
                        state.state = "playing";
                    })
                );
                // start respawn timer
                getComponent(ball, "respawn").deathTime = millis();
            } // if
        })
    );

    //
    // the ball
    //
    ball = createEntity("ball");
    addComponent(ball, "shape", makeShape("blue", "blue", 10, 10, "circle"));
    addComponent(ball, "velocity", makeVelocity(1, 1, 1));
    addComponent(ball, "position", makePosition(0, 0));
    addComponent(
        ball,
        "boundedByRect",
        makeBoundedByRect(
            { x: 0, y: 0, width: PLAYFIELD.width, height: PLAYFIELD.height },
            () => {
                const lives = getComponent(game, "lives");
                lives.lives--;
                if (lives.lives <= 0) {
                    const state = getComponent(game, "state");
                    state.state = "gameOver";
                    getComponent(ball, "shape").show = false;
                    return;
                }
                addComponent(
                    ball,
                    "respawn",
                    makeRespawn(1500, () => {
                        initBall();
                    })
                );
                getComponent(ball, "shape").show = false;
                getComponent(ball, "respawn").deathTime = millis();
            }
        )
    );

    //
    // the paddle
    //
    paddle = createEntity("paddle");
    addComponent(paddle, "shape", makeShape("brown", "brown", 60, 13, "rect"));
    addComponent(paddle, "velocity", makeVelocity(0, 0, 1));
    addComponent(paddle, "position", makePosition(100, 360));
    addComponent(paddle, "mouseControl", makeMouseControl(30));
    addComponent(paddle, "stats", { hits: 0 });

    //
    // the score board
    //
    scoreBoard = createEntity("scoreBoard");
    addComponent(scoreBoard, "position", makePosition(10, 15));
    // addComponent(scoreBoard, "scoretext", makeText("Score: 0"));
    // addComponent(scoreBoard, "livestext", makeText("Lives: 3"));

    //
    // the bricks
    //
    const numRows = 5;
    const numCols = 13;
    // const numRows = 1;
    // const numCols = 5;
    const brickWidth = 30;
    const brickHeight = 10;
    const topLeftX = 5;
    const topLeftY = 100;
    const bricksComponent = getComponent(game, "bricks");
    for (let row = 0; row < numRows; row++) {
        for (let col = 0; col < numCols; col++) {
            const b = createEntity(`brick-${row}-${col}`);
            bricksComponent.bricks.push(b);

            const brickFillColor = randBrickColor();
            const render = makeShape(
                brickFillColor, // fill
                "black", // stroke
                brickWidth,
                brickHeight,
                "rect"
            );
            addComponent(b, "shape", render);

            const pos = makePosition(
                topLeftX + brickWidth * col,
                topLeftY + brickHeight * row,
                false // showPosition
            );
            addComponent(b, "position", pos);

            const hit = makeDoOnHit(() => {
                const score = getComponent(game, "score");
                score.score += 10;
                getComponent(b, "shape").show = false;
                const brickRender = getComponent(b, "shape");
                addComponent(
                    b,
                    "explosion",
                    makeExplosion(pos.x, pos.y, brickRender.fill, 10)
                );
            });
            addComponent(b, "brickHitTrigger", hit);
        } // for
    } // for
} // createCoreEntities

function initGame() {
    console.log("=== Starting initGame ===");

    const score = getComponent(game, "score");
    score.score = 0;
    const lives = getComponent(game, "lives");
    lives.lives = 3;

    const state = getComponent(game, "state");
    state.state = "playing";

    // reset ball
    const render = getComponent(ball, "shape");
    render.show = false;
    const pos = getComponent(ball, "position");
    pos.x = 0;
    pos.y = 0;

    // add respawn component to create initial delay
    if (world.get(ball).has("respawn")) {
        removeComponent(ball, "respawn");
    }
    // reset bricks to be all visible right away so that the player sees them
    // while waiting for the ball to respawn
    const bricks = getComponent(game, "bricks");
    for (const brickId of bricks.bricks) {
        const render = getComponent(brickId, "shape");
        render.show = true;
    }

    addComponent(
        ball,
        "respawn",
        makeRespawn(1500, () => {
            initBall();
        })
    );

    // Start the respawn timer
    getComponent(ball, "respawn").deathTime = millis();

    console.log("=== Finished initGame ===");
} // initGame

//
// setup and draw used by P5
//
function setup() {
    console.log("=== Starting setup ===");
    createCanvas(PLAYFIELD.width, PLAYFIELD.height);
    createCoreEntities();
    initGame();
    console.log("=== Finished setup ===");
} // setup

let mouseWasPressed = false;

function draw() {
    background(220);

    const state = getComponent(game, "state");

    if (state.state === "gameOver") {
        // Display game over message
        push();
        textAlign(CENTER, CENTER);
        textSize(32);
        fill("black");
        text("GAME OVER", PLAYFIELD.width / 2, PLAYFIELD.height / 2);
        text(
            "Click to restart",
            PLAYFIELD.width / 2,
            PLAYFIELD.height / 2 + 40
        );
        pop();

        // Check for mouse click to restart
        if (mouseIsPressed && !mouseWasPressed) {
            initGame();
        } else if (!mouseIsPressed) {
            mouseWasPressed = false;
        }
        return;
    }

    if (state.state === "paused") {
        // Display pause message
        push();
        textAlign(CENTER, CENTER);
        textSize(32);
        fill("black");
        text("PAUSED", PLAYFIELD.width / 2, PLAYFIELD.height / 2);
        text(
            "Press P to continue",
            PLAYFIELD.width / 2,
            PLAYFIELD.height / 2 + 40
        );
        pop();
        // mouseControlSystem();
        keyHandlingSystem();
        // collisionSystem();
        // movementSystem();
        // boundarySystem();
        // respawnSystem();
        scoreDisplaySystem();
        renderSystem();
        explosionSystem();
        return;
    }

    if (state.state === "respawning") {
        respawnSystem();
        scoreDisplaySystem();
        renderSystem();
        explosionSystem();
        return;
    }

    mouseControlSystem();
    keyHandlingSystem();
    collisionSystem();
    movementSystem();
    boundarySystem();
    respawnSystem();
    scoreDisplaySystem();
    renderSystem();
    explosionSystem();
} // draw
