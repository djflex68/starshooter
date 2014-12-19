/// <reference path="../../core/socket-events.ts" />

declare var io: any;

class Game {

    public leftFighter: Phaser.Sprite;
    public rightFighter: Phaser.Sprite;

    public controlledFighter: Phaser.Sprite;
    public opponentFighter: Phaser.Sprite;

    public leftScore: Phaser.Text;
    public rightScore: Phaser.Text;

    public firedLasers: { laser: Phaser.Sprite; direction: number; }[] = [];
    public timeSinceLastShot: number = new Date().getTime();

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
        
        this.game.physics.arcade.enableBody(this.leftFighter);
        this.game.physics.arcade.enableBody(this.rightFighter);

        this.leftFighter.body.checkWorldBounds = true;
        this.rightFighter.body.checkWorldBounds = true;

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

            if (this.cursors.down.isDown) {
                
                if (this.controlledFighter.y + 10 < this.game.height - this.controlledFighter.height / 2) {
                    this.controlledFighter.y += 10;
                } else {
                    this.controlledFighter.y = this.game.height - this.controlledFighter.height / 2;
                }

                this.emitFighterPosition();

            } else if (this.cursors.up.isDown) {

                if (this.controlledFighter.y - 10 >= this.controlledFighter.height / 2) {
                    this.controlledFighter.y -= 10;
                } else {
                    this.controlledFighter.y = this.controlledFighter.height / 2;
                }

                this.emitFighterPosition();
            }


            if (this.spaceBar.isDown) {
                if ( Math.abs(this.timeSinceLastShot - new Date().getTime()) > 200) {
                    this.fireLaser();
                    this.timeSinceLastShot = new Date().getTime();
                }
                
            }


            // Animate lasers
            this.animateLasers();            
        }
        
    }

    private laserFiredHandler(): void {
        var direction: number = this.opponentFighter === this.leftFighter ? 1 : -1,
            laser: Phaser.Sprite = this.generateLaser(this.opponentFighter.position.x,
                this.opponentFighter.position.y);

        this.firedLasers.push({
            laser: laser,
            direction: direction
        });
    }

    private fireLaser(): void {
        var direction: number = this.controlledFighter === this.leftFighter ? 1 : -1,
            laser: Phaser.Sprite = this.generateLaser(this.controlledFighter.position.x,
                                                      this.controlledFighter.position.y);

        this.socket.emit('laser-fired');
        
        this.firedLasers.push({
            laser: laser,
            direction: direction
        });
    }

    private animateLasers(): void {
        var lasersToDelete: any[] = [];
        $.each(this.firedLasers, (index: number, obj: { laser: Phaser.Sprite; direction: number; }) => {

            obj.laser.x += obj.direction * 10;

            if (obj.laser.x > this.game.world.width || obj.laser.x <= 0) {
                lasersToDelete.push(obj);
            }

            this.game.physics.arcade.overlap(obj.laser,
                                            obj.direction > 0 ? this.rightFighter : this.leftFighter,
                (laser: Phaser.Sprite, fighter: Phaser.Sprite) => {
                    
                    if ($.inArray(obj, lasersToDelete) === -1) {
                        console.warn("COLLLIIDDDE");
                        lasersToDelete.push(obj);

                        if (fighter === this.leftFighter) {
                            this.rightScore.text = (parseInt(this.rightScore.text) + 1).toString();
                        } else {
                            this.leftScore.text = (parseInt(this.leftScore.text) + 1).toString();
                        }

                    }

            }, null, this);
        });

        $.each(lasersToDelete, (index: number, obj: { laser: Phaser.Sprite; direction: number; }) => {
            var idx = $.inArray(obj, this.firedLasers);

            if (idx > -1) {
                var deletedSprite: { laser: Phaser.Sprite; direction: number; } = this.firedLasers.splice(idx, 1)[0];
                if (deletedSprite) {
                    deletedSprite.laser.destroy();
                }
            }
        });
    }

    private generateLaser(x: number, y: number): Phaser.Sprite {
        var result: Phaser.Sprite = this.game.add.sprite(x, y, 'laser');
        result.scale.setTo(0.25, 0.25);

        this.game.physics.arcade.enableBody(result);
        result.body.checkCollision.left = true;
        result.body.checkCollision.right = true;
                
        return result;
    }

    private emitFighterPosition(): void {
        this.socket.emit('position', JSON.stringify(this.controlledFighter.position));
    }
}