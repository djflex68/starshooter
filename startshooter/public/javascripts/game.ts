/// <reference path="../../core/socket-events.ts" />

declare var io: any;

class Game {

    private static FIGTHER_VELOCITY_Y: number = 500;
    private static LASER_VELOCITY_Y: number = 350;

    public leftFighter: Phaser.Sprite;
    public rightFighter: Phaser.Sprite;

    public controlledFighter: Phaser.Sprite;
    public opponentFighter: Phaser.Sprite;

    public leftScore: Phaser.Text;
    public rightScore: Phaser.Text;

    public firedLasers: { laser: Phaser.Sprite; direction: number; }[] = [];
    public timeSinceLastShot: number = new Date().getTime();

    public asteroids: Phaser.Sprite[] = [];

    public game: Phaser.Game;

    public cursors: Phaser.CursorKeys;
    public spaceBar: Phaser.Key;

    public role: string;

    // Socket IO
    public socket: any;

    public initGame(options: {
            width: number;
            height: number;
            containerId: string;
        },
        role: string,
        socket:any): void {

        this.role = role;
        this.socket = socket;

        socket.on('opponent-position', (positionStr: string) => {
            var position = JSON.parse(positionStr);
            this.opponentFighter.position = position;
        });

        socket.on('laser-fired', () => {
            this.laserFiredHandler();
        });

        this.game = new Phaser.Game(options.width || 800,
                                    options.height || 600,
                                    Phaser.AUTO,
                                    options.containerId || '', {
            preload: () => {
                this.gamePreload();
            },
            create: () => {
                this.gameCreate();
            },
            update: () => {
                this.gameUpdate();
            }
        });
    }

    private gamePreload(): void {
        this.game.load.image('fighter-left', 'imgs/redfighter-left.png');
        this.game.load.image('fighter-right', 'imgs/redfighter-right.png');
        this.game.load.image('laser', 'imgs/laser.png');

        this.game.load.atlasJSONHash('asteroid', 'imgs/asteroid-sprite.png', 'asteroid-animation.json');
        this.game.load.atlasJSONHash('explosion', 'imgs/explosion-sprite.png', 'explosion-animation.json');
    }

    private gameCreate(): void {

        this.game.physics.startSystem(Phaser.Physics.ARCADE);
                
        this.leftFighter = this.game.add.sprite(0, this.game.world.centerY, 'fighter-left');
        this.leftFighter.scale.setTo(0.25, 0.25);
        this.leftFighter.anchor.setTo(0, 0.5);

        
        this.rightFighter = this.game.add.sprite(this.game.world.width, this.game.world.centerY, 'fighter-right');
        this.rightFighter.scale.setTo(0.25, 0.25);
        this.rightFighter.anchor.setTo(1, 0.5);

        this.cursors = this.game.input.keyboard.createCursorKeys();
        this.spaceBar = this.game.input.keyboard.addKey(Phaser.Keyboard.SPACEBAR);
        
        
        if (this.role === 'left') {
            this.controlledFighter = this.leftFighter;
            this.opponentFighter = this.rightFighter;
        } else if( this.role === 'right') {
            this.controlledFighter = this.rightFighter;
            this.opponentFighter = this.leftFighter;
        }
        
        
        this.game.physics.enable(this.leftFighter, Phaser.Physics.ARCADE);
        this.game.physics.enable(this.rightFighter, Phaser.Physics.ARCADE);

        this.leftFighter.body.collideWorldBounds = true;
        this.rightFighter.body.collideWorldBounds = true;

        this.leftFighter.body.checkCollision.right = true;
        this.rightFighter.body.checkCollision.left = true;


        // Score
        var style = { font: '72px Arial', fill: '#ffffff' };
        this.leftScore = this.game.add.text(0, 0, '0', style);

        this.rightScore = this.game.add.text(this.game.width, 0, '0', style);
        this.rightScore.anchor.set(1, 0);

    }

    private gameUpdate(): void {
        if (this.controlledFighter) {

            this.controlledFighter.body.velocity.y = 0;

            if (this.cursors.down.isDown) {

                this.controlledFighter.body.velocity.y = Game.FIGTHER_VELOCITY_Y;

                this.emitFighterPosition();

            } else if (this.cursors.up.isDown) {
                this.controlledFighter.body.velocity.y = -Game.FIGTHER_VELOCITY_Y;

                this.emitFighterPosition();
            }


            if (this.spaceBar.isDown) {
                if ( Math.abs(this.timeSinceLastShot - new Date().getTime()) > 200) {
                    this.fireLaser();
                    this.timeSinceLastShot = new Date().getTime();
                }
                
            }

            // Generate Random Asteroids
            // TODO: the server should handle this ...
            this.generateAsteroids();

            // Check lasers collisions
            this.collideLasers();
        }
        
    }
    
    private laserFiredHandler(): void {
        var direction: number = this.opponentFighter === this.leftFighter ? 1 : -1,
            laser: Phaser.Sprite = this.generateLaser(this.opponentFighter.position.x + direction*this.opponentFighter.width,
                this.opponentFighter.position.y, direction);

        this.firedLasers.push({
            laser: laser,
            direction: direction
        });
    }

    private fireLaser(): void {
        var direction: number = this.controlledFighter === this.leftFighter ? 1 : -1,
            laser: Phaser.Sprite = this.generateLaser(this.controlledFighter.position.x + direction*this.controlledFighter.width,
                                                        this.controlledFighter.position.y,
                                                        direction);

        this.socket.emit('laser-fired');

        this.firedLasers.push({
            laser: laser,
            direction: direction
        });
    }

    private collideLasers(): void {
        var lasersToDelete: any[] = [];
        $.each(this.firedLasers, (index: number, obj: { laser: Phaser.Sprite; direction: number; }) => {

            // If out of bounds, delete them
            if (!obj.laser.exists) {
                lasersToDelete.push(obj);
            } else {
                // If colliding with figthers, delete them
                // and register score
                this.game.physics.arcade.overlap(obj.laser,
                    obj.direction > 0 ? this.rightFighter : this.leftFighter,
                    (laser: Phaser.Sprite, fighter: Phaser.Sprite) => {


                        this.explodeAt(laser.position.x + (fighter === this.rightFighter? 1 : 0) * laser.width, laser.position.y);
                        
                        if ($.inArray(obj, lasersToDelete) === -1) {

                            lasersToDelete.push(obj);

                            if (fighter === this.leftFighter) {
                                this.rightScore.text = (parseInt(this.rightScore.text) + 1).toString();
                            } else {
                                this.leftScore.text = (parseInt(this.leftScore.text) + 1).toString();
                            }

                        }

                    }, null, this);
            }

        });

        this.deleteLaserFromCollection(lasersToDelete);
    }

    private deleteLaserFromCollection(toDelete: { laser: Phaser.Sprite; direction: number; }[]): void {
        $.each(toDelete, (index: number, obj: { laser: Phaser.Sprite; direction: number; }) => {
            var idx = $.inArray(obj, this.firedLasers);

            if (idx > -1) {
                var deletedSprite: { laser: Phaser.Sprite; direction: number; } = this.firedLasers.splice(idx, 1)[0];
                if (deletedSprite) {
                    // free up memory
                    deletedSprite.laser.destroy();
                }
            }
        });
    }

    private generateLaser(x: number, y: number, direction: number): Phaser.Sprite {
        var result: Phaser.Sprite = this.game.add.sprite(x, y, 'laser');
        result.scale.setTo(0.25, 0.25);

        this.game.physics.enable(result, Phaser.Physics.ARCADE);

        if (direction > 0) {
            result.body.checkCollision.left = false;
            result.body.checkCollision.right = true;
        } else {
            result.body.checkCollision.left = true;
            result.body.checkCollision.right = false;
        }

        // Kill laser when out of world
        result.checkWorldBounds = true;
        result.outOfBoundsKill = true;

        result.body.velocity.x = direction * Game.LASER_VELOCITY_Y;
        
        return result;
    }

    private explodeAt(x: number, y: number): void {
        // explosion
        var explosion = this.game.add.sprite(x, y, 'explosion');
        explosion.anchor.setTo(0.5, 0.5);

        explosion.animations.add('boom');
        explosion.animations.play('boom', 20);

        explosion.animations.currentAnim.killOnComplete = true;
    }

    private emitFighterPosition(): void {
        this.socket.emit('position', JSON.stringify(this.controlledFighter.position));
    }



    private generateAsteroids(): void {
        // THIS METHOD has been created to see how
        // animation works
        // Clearly, the way position is handled should be managed
        // by the server
        if (this.asteroids.length < 5) {
            // asteroid
            var sign: number = Math.floor(Math.random() * 1000) % 2 ? 1 : -1;
            var asteroid: Phaser.Sprite = this.game.add.sprite(this.game.world.centerX + sign * 200 * Math.random(), 0, 'asteroid');

            this.asteroids.push(asteroid);

            // Run animation
            asteroid.animations.add('run');
            asteroid.animations.play('run', 7, true);

            // Collision part
            this.game.physics.enable(asteroid, Phaser.Physics.ARCADE);

            asteroid.body.checkCollision.left = true;
            asteroid.body.checkCollision.right = true;

            // Kill asteroid when out of world
            asteroid.checkWorldBounds = true;
            asteroid.outOfBoundsKill = true;

            asteroid.body.velocity.y = 150 * Math.random() + 80;
        }

        var toDelete: Phaser.Sprite[] = [];
        $.each(this.asteroids, (index: number, asteroid: Phaser.Sprite) => {

            if (!asteroid.exists) {
                toDelete.push(asteroid);
            } else {

                // Checking collisions
                var lasersToDelete: any[] = [];
                $.each(this.firedLasers, (indexLaser: number, obj: {
                    direction: number; laser: Phaser.Sprite;
                }) => {
                    this.game.physics.arcade.overlap(obj.laser,
                        asteroid,
                        (laser: Phaser.Sprite, asteroid: Phaser.Sprite) => {

                            this.explodeAt(laser.position.x + (asteroid.position.x > laser.position.x ? 1 : 0) * laser.width, laser.position.y);

                            if ($.inArray(obj, lasersToDelete) === -1) {
                                lasersToDelete.push(obj);
                            }

                        }, null, this);
                });


                this.deleteLaserFromCollection(lasersToDelete);
            }

        });


        $.each(toDelete, (index: number, asteroid: Phaser.Sprite) => {
            var idx = $.inArray(asteroid, this.asteroids);

            if (idx > -1) {
                var deletedAsteroid: Phaser.Sprite = this.asteroids.splice(idx, 1)[0];
                if (deletedAsteroid) {
                    deletedAsteroid.destroy();
                }
            }
        });

    }
}