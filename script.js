// Sprite sheet dimensions
const SPRITE_WIDTH = 24;
const SPRITE_HEIGHT = 24;
const FRAMES_PER_ROW = 24;

// Physics constants
const MOVEMENT_SPEED = 4;
const MAX_VELOCITY = 6;
const FRICTION = 0.9;
const ACCELERATION = 0.4;
const KICK_COOLDOWN = 300;

// Game settings
const NUM_OBSTACLES = 8;
const OBSTACLE_DAMAGE = 10;
const COLLISION_BOUNCE = 2;

// Animation definitions directly from DinoSprites.json
const animations = {
    idle: { start: 0, end: 3, direction: "forward" },
    move: { start: 4, end: 9, direction: "forward" },
    kick: { start: 10, end: 12, direction: "forward", loop: false },
    hurt: { start: 13, end: 16, direction: "forward" },
    crouch: { start: 17, end: 17, direction: "forward" },
    sneak: { start: 18, end: 23, direction: "forward" }
};

// Preload all sprite sheets
const characters = ['vita', 'mort', 'tard', 'doux'];
const spriteImages = {};
const obstacles = [];

let frameIndex = 0;
let animationInterval;
let stateService;
let gameStarted = false;
let keys = {};
let position = { x: 400, y: 300 };
let velocity = { x: 0, y: 0 };
let facing = 1; // 1 for right, -1 for left
let rotation = 0;
let lastKickTime = 0;
let isKicking = false;
let kickTimeout;
let spritesLoaded = false;

// Initialize the game
function initGame() {
    // Create the state machine
    const stateMachine = XState.createMachine({
        id: 'dino',
        initial: 'idle',
        states: {
            idle: {
                on: {
                    MOVE: 'move',
                    KICK: 'kick',
                    HURT: 'hurt',
                    CROUCH: 'crouch',
                    SNEAK: 'sneak'
                }
            },
            move: {
                on: {
                    IDLE: 'idle',
                    KICK: 'kick',
                    HURT: 'hurt',
                    CROUCH: 'crouch',
                    SNEAK: 'sneak'
                }
            },
            kick: {
                on: {
                    IDLE: 'idle',
                    MOVE: 'move',
                    HURT: 'hurt'
                }
            },
            hurt: {
                on: {
                    IDLE: 'idle',
                    MOVE: 'move'
                },
                after: {
                    1000: [
                        { target: 'move', cond: () => Math.abs(velocity.x) > 0.1 || Math.abs(velocity.y) > 0.1 },
                        { target: 'idle' }
                    ]
                }
            },
            crouch: {
                on: {
                    IDLE: 'idle',
                    MOVE: 'move',
                    KICK: 'kick',
                    HURT: 'hurt',
                    SNEAK: 'sneak'
                }
            },
            sneak: {
                on: {
                    IDLE: 'idle',
                    MOVE: 'move',
                    KICK: 'kick',
                    HURT: 'hurt',
                    CROUCH: 'crouch'
                }
            }
        }
    });

    // Create the state machine service
    stateService = XState.interpret(stateMachine)
        .onTransition((state) => {
            // Update UI to show current state
            document.getElementById('currentState').textContent = state.value;
            
            // Update animation when state changes
            console.log(`State transition to: ${state.value}`);
            updateAnimation(state.value);
        })
        .start();

    // Generate obstacles
    generateObstacles();

    // Subscribe to store changes
    store.subscribe((state) => {
        if (state.isHurt) {
            stateService.send('HURT');
            setTimeout(() => {
                store.setState({ isHurt: false });
            }, 1000);
        }
    });

    // Start the game loop
    requestAnimationFrame(gameLoop);
}

function generateObstacles() {
    const gameWorld = document.getElementById('gameWorld');
    const worldWidth = gameWorld.clientWidth;
    const worldHeight = gameWorld.clientHeight;
    
    // Clear existing obstacles
    obstacles.forEach(obstacle => {
        if (obstacle.element) {
            gameWorld.removeChild(obstacle.element);
        }
        if (obstacle.dangerZone) {
            gameWorld.removeChild(obstacle.dangerZone);
        }
    });
    obstacles.length = 0;
    
    // Generate new obstacles
    for (let i = 0; i < NUM_OBSTACLES; i++) {
        const obstacleElement = document.createElement('div');
        obstacleElement.className = 'obstacle';
        
        // Position away from player start
        let x, y;
        do {
            x = Math.random() * (worldWidth - 60) + 30;
            y = Math.random() * (worldHeight - 60) + 30;
        } while (Math.abs(x - position.x) < 100 && Math.abs(y - position.y) < 100);
        
        obstacleElement.style.left = `${x}px`;
        obstacleElement.style.top = `${y}px`;
        
        gameWorld.appendChild(obstacleElement);
        
        // Create a visible danger zone element
        const dangerZone = document.createElement('div');
        dangerZone.className = 'danger-zone';
        dangerZone.style.position = 'absolute';
        dangerZone.style.left = `${x + 10}px`;
        dangerZone.style.top = `${y + 15}px`;
        dangerZone.style.width = `${20}px`;
        dangerZone.style.height = `${40}px`;
        dangerZone.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
        dangerZone.style.border = '1px solid red';
        dangerZone.style.zIndex = '4';
        gameWorld.appendChild(dangerZone);
        
        obstacles.push({
            element: obstacleElement,
            dangerZone: dangerZone,
            x: x,
            y: y,
            width: 40,
            height: 60,
            hitbox: { x: 10, y: 15, width: 20, height: 40 } // Adjust hitbox to be smaller than visual
        });
    }
}

function updateHealthBar() {
    const health = store.getState().health;
    document.getElementById('healthFill').style.width = `${health}%`;
}

function handleKeyDown(e) {
    keys[e.key.toLowerCase()] = true;
    
    // Start game on first key press
    if (!gameStarted) {
        gameStarted = true;
        document.getElementById('instructions').classList.add('hidden');
    }
    
    // Handle kick with space (continuous while held)
    if (e.key === ' ' && !isKicking) {
        handleKickAction();
    }
}

function handleKeyUp(e) {
    keys[e.key.toLowerCase()] = false;
    
    // Stop kicking when space is released
    if (e.key === ' ') {
        isKicking = false;
    }
}

function handleKickAction() {
    const now = Date.now();
    isKicking = true;
    
    // Only send the KICK event and set the animation if we're not already kicking
    if (stateService.state.value !== 'kick') {
        stateService.send('KICK');
        
        // Automatically return to the previous state after kick animation completes
        clearTimeout(kickTimeout);
        kickTimeout = setTimeout(() => {
            if (isKicking) {
                // If still holding kick, trigger another kick
                handleKickAction();
            } else {
                // Return to idle or move state
                const isMoving = velocity.x !== 0 || velocity.y !== 0;
                stateService.send(isMoving ? 'MOVE' : 'IDLE');
            }
        }, 300);
    }
}

function checkCollisions() {
    const playerHitbox = {
        x: position.x - 12,
        y: position.y - 12,
        width: 24,
        height: 24
    };
    
    // Check collision with obstacles
    obstacles.forEach(obstacle => {
        const obstacleHitbox = {
            x: obstacle.x + obstacle.hitbox.x,
            y: obstacle.y + obstacle.hitbox.y,
            width: obstacle.hitbox.width,
            height: obstacle.hitbox.height
        };
        
        if (checkHitboxCollision(playerHitbox, obstacleHitbox)) {
            // Take damage if not already hurt
            if (stateService.state.value !== 'hurt') {
                store.getState().takeDamage(OBSTACLE_DAMAGE);
                updateHealthBar();
                store.setState({ isHurt: true });
                
                // Apply collision response
                const collisionVector = {
                    x: position.x - obstacle.x,
                    y: position.y - obstacle.y
                };
                
                // Normalize and apply bounce force
                const magnitude = Math.sqrt(collisionVector.x * collisionVector.x + collisionVector.y * collisionVector.y);
                velocity.x += (collisionVector.x / magnitude) * COLLISION_BOUNCE;
                velocity.y += (collisionVector.y / magnitude) * COLLISION_BOUNCE;
                
                // Set a timeout to explicitly exit hurt state after animation
                setTimeout(() => {
                    store.setState({ isHurt: false });
                    if (stateService.state.value === 'hurt') {
                        if (Math.abs(velocity.x) > 0.1 || Math.abs(velocity.y) > 0.1) {
                            stateService.send('MOVE');
                        } else {
                            stateService.send('IDLE');
                        }
                    }
                }, 1000);
            }
        }
    });
}

function checkHitboxCollision(hitbox1, hitbox2) {
    return (
        hitbox1.x < hitbox2.x + hitbox2.width &&
        hitbox1.x + hitbox1.width > hitbox2.x &&
        hitbox1.y < hitbox2.y + hitbox2.height &&
        hitbox1.y + hitbox1.height > hitbox2.y
    );
}

function updatePhysics() {
    if (!gameStarted) return;

    // Apply acceleration based on input
    let ax = 0;
    let ay = 0;
    
    // Check if shift key is held
    const isShiftHeld = keys['shift'];
    
    // Check if any movement keys are pressed
    const isAnyMovementKey = keys['w'] || keys['a'] || keys['s'] || keys['d'] || 
                             keys['arrowup'] || keys['arrowleft'] || keys['arrowdown'] || keys['arrowright'];
    
    // Get current state
    const currentState = stateService.state.value;
    
    // IMPORTANT: Handle shift-based state transitions
    
    // If shift key is held...
    if (isShiftHeld) {
        // If any movement keys are pressed while shift is held, switch to SNEAK
        if (isAnyMovementKey && currentState !== 'sneak' && !['kick', 'hurt'].includes(currentState)) {
            console.log("Entering sneak state from updatePhysics");
            stateService.send('SNEAK');
        } 
        // If shift is held but no movement, switch to CROUCH
        else if (!isAnyMovementKey && currentState !== 'crouch' && !['kick', 'hurt'].includes(currentState)) {
            console.log("Entering crouch state from updatePhysics");
            stateService.send('CROUCH');
        }
    } 
    // If shift key is NOT held but we're in a shift-dependent state, exit that state
    else if ((currentState === 'crouch' || currentState === 'sneak') && !['kick', 'hurt'].includes(currentState)) {
        // Return to appropriate state when shift is no longer held
        if (isAnyMovementKey) {
            console.log("Exiting shift state to MOVE");
            stateService.send('MOVE');
        } else {
            console.log("Exiting shift state to IDLE");
            stateService.send('IDLE');
        }
    }
    
    // Movement speed modifier based on state
    const isSneaking = currentState === 'sneak';
    const speedModifier = isSneaking ? 0.5 : 1;
    
    // Handle WASD movement
    if (keys['w'] || keys['arrowup']) {
        ay -= ACCELERATION * speedModifier;
    }
    if (keys['s'] || keys['arrowdown']) {
        ay += ACCELERATION * speedModifier;
    }
    
    // Only change facing for horizontal movement
    if (keys['a'] || keys['arrowleft']) {
        ax -= ACCELERATION * speedModifier;
        facing = -1; // Face left
    }
    if (keys['d'] || keys['arrowright']) {
        ax += ACCELERATION * speedModifier;
        facing = 1; // Face right
    }
    
    // Add acceleration to velocity
    velocity.x += ax;
    velocity.y += ay;
    
    // Apply friction
    velocity.x *= FRICTION;
    velocity.y *= FRICTION;
    
    // Clamp velocity - lower max velocity when sneaking
    const currentMaxVelocity = isSneaking ? MAX_VELOCITY * 0.5 : MAX_VELOCITY;
    velocity.x = Math.max(-currentMaxVelocity, Math.min(currentMaxVelocity, velocity.x));
    velocity.y = Math.max(-currentMaxVelocity, Math.min(currentMaxVelocity, velocity.y));
    
    // Update position
    position.x += velocity.x;
    position.y += velocity.y;
    
    // Keep character within bounds
    const container = document.querySelector('.container');
    position.x = Math.max(12, Math.min(position.x, container.clientWidth - 12));
    position.y = Math.max(12, Math.min(position.y, container.clientHeight - 12));
    
    // Update sprite container position - NO ROTATION
    const spriteContainer = document.getElementById('spriteContainer');
    spriteContainer.style.transform = `translate(${position.x}px, ${position.y}px)`;
    
    // Update sprite's horizontal flip based on facing direction - do this continuously
    const sprite = document.getElementById('sprite');
    sprite.style.transform = `scale(3) scaleX(${facing})`;
    
    // Update animation state based on movement, but respect current states
    const isMoving = Math.abs(velocity.x) > 0.1 || Math.abs(velocity.y) > 0.1;
    
    // Only auto-transition between idle and move if not in special states and shift is not held
    if (!['crouch', 'sneak', 'kick', 'hurt'].includes(currentState) && !isShiftHeld) {
        if (isMoving && currentState !== 'move') {
            stateService.send('MOVE');
        } else if (!isMoving && currentState === 'move') {
            stateService.send('IDLE');
        }
    }
    
    // Check for collisions
    checkCollisions();
}

function gameLoop() {
    updatePhysics();
    requestAnimationFrame(gameLoop);
}

function updateAnimation(animationName) {
    console.log(`Setting animation: ${animationName}`);
    
    // Special case for sneak - ensure we're using the correct frames from DinoSprites.json
    if (animationName === 'sneak') {
        console.log("APPLYING SNEAK ANIMATION - frames 18-23");
        
        // Clear any existing animation
        if (animationInterval) {
            clearInterval(animationInterval);
            animationInterval = null;
        }
        
        // Force the frame index to sneak animation start (18)
        frameIndex = 18;
        updateSpriteFrame();
        
        // Set up the animation loop through frames 18-23
        animationInterval = setInterval(() => {
            // Advance to next frame
            frameIndex++;
            
            // Loop back to start frame if we reach the end
            if (frameIndex > 23) {
                frameIndex = 18;
            }
            
            // Update sprite with current frame
            updateSpriteFrame();
        }, 100);
        
        return;
    }
    
    // Get the current animation data
    const currentAnim = animations[animationName];
    if (!currentAnim) {
        console.error(`Unknown animation: ${animationName}`);
        return;
    }
    
    // Clear any existing animation interval
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
    
    // Set starting frame
    frameIndex = currentAnim.start;
    
    // Set initial frame immediately
    updateSpriteFrame();
    
    // For static animations (like crouch with only one frame), no need for interval
    if (currentAnim.start === currentAnim.end) {
        return;
    }
    
    // For all other animations, set up the frame interval
    animationInterval = setInterval(() => {
        // Increment the frame
        frameIndex++;
        
        // Handle wrap-around for looping animations
        if (frameIndex > currentAnim.end) {
            // For non-looping animations, clear the interval and return to idle/move
            if (currentAnim.loop === false) {
                clearInterval(animationInterval);
                animationInterval = null;
                
                // Return to idle/move after non-looping animation
                setTimeout(() => {
                    const isMoving = Math.abs(velocity.x) > 0.1 || Math.abs(velocity.y) > 0.1;
                    const nextState = isMoving ? 'MOVE' : 'IDLE';
                    stateService.send(nextState);
                    console.log(`Animation complete, transitioning to: ${nextState}`);
                }, 50);
                return;
            }
            
            // Reset to start for looping animations
            frameIndex = currentAnim.start;
        }
        
        // Update the sprite with the new frame
        updateSpriteFrame();
    }, 100); // 100ms per frame = 10fps
}

// Helper function to update sprite frame
function updateSpriteFrame() {
    const sprite = document.getElementById('sprite');
    if (!sprite) return;
    
    const currentCharacter = store.getState().character;
    
    // Calculate the position in the sprite sheet
    const x = frameIndex * SPRITE_WIDTH;
    const y = 0;
    
    // Make sure the character is valid
    if (!characters.includes(currentCharacter)) {
        console.error(`Invalid character: ${currentCharacter}`);
        return;
    }
    
    // Apply the sprite image and position
    sprite.style.backgroundImage = `url('./public/DinoSprites - ${currentCharacter}.png')`;
    sprite.style.backgroundPosition = `-${x}px -${y}px`;
    sprite.style.backgroundSize = `${SPRITE_WIDTH * FRAMES_PER_ROW}px ${SPRITE_HEIGHT}px`;
    
    // Make sure the sprite is visible
    sprite.style.display = 'block';
    
    // Debug log the current frame and state
    console.log(`Animation frame: ${frameIndex}, character: ${currentCharacter}`);
}

function changeCharacter(character) {
    store.setState({ character });
    
    // Force animation update with current state
    if (stateService) {
        updateAnimation(stateService.state.value);
    } else {
        updateAnimation('idle');
    }
}

function sendEvent(event) {
    console.log(`Received event: ${event}`);
    
    // Add special case to directly test sneak animation
    if (event === 'SNEAK') {
        console.log("SNEAK event received, applying sneak animation");
        stateService.send(event);
        return;
    }
    
    // Send the event to the state machine
    stateService.send(event);
    
    // If we're transitioning to idle or move, make sure it sticks
    if (event === 'IDLE' || event === 'MOVE') {
        // These states might be overridden by the physics update, so let's update
        // the velocity to match the requested state
        if (event === 'IDLE') {
            // Reduce velocity to ensure we stay in idle
            velocity = { x: 0, y: 0 };
        } else if (event === 'MOVE' && Math.abs(velocity.x) < 0.1 && Math.abs(velocity.y) < 0.1) {
            // Add a small velocity to ensure we stay in move state
            velocity = { x: 0.2 * facing, y: 0 };
        }
    }
    
    // Special handling for crouch and sneak (button controls)
    if (event === 'CROUCH' || event === 'SNEAK') {
        // Clear any existing timeout
        if (window.stateResetTimeout) {
            clearTimeout(window.stateResetTimeout);
        }
        
        // Set a timeout to return to idle/move after 2 seconds
        window.stateResetTimeout = setTimeout(() => {
            const isMoving = Math.abs(velocity.x) > 0.1 || Math.abs(velocity.y) > 0.1;
            stateService.send(isMoving ? 'MOVE' : 'IDLE');
        }, 2000);
    }
    
    // Debug animation test
    if (event === 'TEST') {
        testAnimations();
    }
}

// Load all sprites and initialize the game
function preloadSprites() {
    let loadedCount = 0;
    const totalSprites = characters.length;
    
    // Pre-cache sprite sheets
    characters.forEach(character => {
        const img = new Image();
        img.src = `./public/DinoSprites - ${character}.png`;
        
        // Store the image in our cache
        spriteImages[character] = img;
        
        img.onload = () => {
            console.log(`Loaded sprite sheet for ${character}`);
            loadedCount++;
            
            // Initialize game when all sprites are loaded
            if (loadedCount === totalSprites) {
                console.log("All sprites loaded, initializing game");
                spritesLoaded = true;
                initGame();
                
                // Ensure sprite is visible with idle animation
                setTimeout(() => {
                    frameIndex = animations.idle.start;
                    updateSpriteFrame();
                    updateAnimation('idle');
                    updateHealthBar();
                }, 100);
            }
        };
        
        img.onerror = (error) => {
            console.error(`Error loading sprite sheet for ${character}:`, error);
            loadedCount++;
            
            // Initialize game even if some sprites fail to load
            if (loadedCount === totalSprites) {
                console.log("Some sprites failed to load, initializing game anyway");
                spritesLoaded = true;
                initGame();
                updateAnimation('idle');
                updateHealthBar();
            }
        };
    });
    
    // Fallback in case images don't load within reasonable time
    setTimeout(() => {
        if (!spritesLoaded) {
            console.warn("Sprites taking too long to load, initializing game anyway");
            spritesLoaded = true;
            initGame();
            updateAnimation('idle');
            updateHealthBar();
        }
    }, 5000);
}

// Add event listeners
window.addEventListener('keydown', handleKeyDown);
window.addEventListener('keyup', handleKeyUp);

// Start preloading sprites
preloadSprites();

// Add explicit debug code to check the sprite sheets and animation frames
function testSneakAnimation() {
    console.log("TESTING SNEAK ANIMATION");
    
    // Force the sneak animation directly
    const sneakAnim = animations.sneak;
    console.log("Sneak animation data:", sneakAnim);
    
    // Start at the first frame for sneak
    frameIndex = sneakAnim.start;
    
    // Force update sprite frame
    updateSpriteFrame();
    
    // Set an interval to test all sneak frames
    let testTimer = setInterval(() => {
        frameIndex++;
        if (frameIndex > sneakAnim.end) {
            clearInterval(testTimer);
            console.log("Sneak animation test complete");
            return;
        }
        
        console.log(`Testing sneak frame: ${frameIndex}`);
        updateSpriteFrame();
    }, 500);
}

// Add a special button handler for troubleshooting
function testAnimations() {
    // Test each animation in sequence
    const animationNames = Object.keys(animations);
    let currentAnimIndex = 0;
    
    const testNextAnimation = () => {
        if (currentAnimIndex >= animationNames.length) {
            console.log("All animations tested");
            return;
        }
        
        const animName = animationNames[currentAnimIndex];
        console.log(`Testing animation: ${animName}`);
        
        // Force this animation
        updateAnimation(animName);
        
        // Move to next animation after a delay
        currentAnimIndex++;
        setTimeout(testNextAnimation, 2000);
    };
    
    // Start the test sequence
    testNextAnimation();
} 