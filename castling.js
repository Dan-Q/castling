// When did we launch?
const epochDate = new Date(Date.UTC(2025, 2, 7));

// Today's date in UTC:
let today = new Date(Date.UTC(
  new Date().getUTCFullYear(),
  new Date().getUTCMonth(),
  new Date().getUTCDate()
));

// Storage for the puzzles:
let puzzles = {};

/**
 * Loads the puzzles for a given year + month (e.g. '202503'). Returns a promise that resolves once the
 * puzzles are loaded, containing all puzzles from all loaded year + months.
 */
function loadPuzzles(yearAndMonth) {
  if (puzzles[yearAndMonth]) {
    return Promise.resolve(puzzles);
  }
  return fetch(`puzzles/${yearAndMonth}.json`).then(r=>r.json()).then(data=>{
    puzzles[yearAndMonth] = data;
    return puzzles;
  });
}

/**
 * A single cell of the puzzle.
 */
class CastlingCell extends HTMLElement {
  constructor() {
    super();
  }

  distanceTo(cell) {
    return Math.abs(this.dataset.x - cell.dataset.x) + Math.abs(this.dataset.y - cell.dataset.y);
  }

  addToPath() {
    this.classList.add('on-path');
  }

  removeFromPath() {
    this.classList.remove('on-path');
    this.removeCurrent(); // removing from path also removes current
  }

  makeStart() {
    this.classList.add('start');
  }

  makeCurrent() {
    this.classList.add('current');
  }

  removeCurrent() {
    this.classList.remove('current');
  }

  flashInvalid() {
    this.classList.add('invalid');
    setTimeout(()=>this.classList.remove('invalid'), 600);
  }

  connectedCallback() {
    this.setAttribute('role', 'button');
  }
}
customElements.define('castling-cell', CastlingCell);

/**
 * A blocking wall on the grid.
 */
class CastlingWall extends HTMLElement {
  constructor() {
    super();
  }
}
customElements.define('castling-wall', CastlingWall);

/**
 * The Castling Grid
 */
class CastlingGrid extends HTMLElement {
  constructor() {
    super();
  }

  setDailyTitle(date, difficulty) {
    const niceDate = date.toLocaleDateString('en-gb', { year: 'numeric', month: 'long', day: 'numeric' });
    const niceDateSuffix = date < today ? ' (historic)' : '';
    let niceDifficulty = 'Daily';
    switch(difficulty) {
      case 0:
        niceDifficulty = 'Regular';
        break;
      case 1:
        niceDifficulty = 'Advanced';
        break;
      case 2:
        niceDifficulty = 'Master';
        break;
    }
    document.getElementById('daily-puzzle-title').textContent = `${niceDifficulty} Puzzle for ${niceDate}${niceDateSuffix}`;
  }

  loadPuzzle(date, difficulty) {
    const yearAndMonth = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    const yearMonthAndDay = `${yearAndMonth}${date.getDate().toString().padStart(2, '0')}`;
    loadPuzzles(yearAndMonth).then(puzzles=>{
      this.puzzle = puzzles[yearAndMonth][yearMonthAndDay][difficulty];
      this.setDailyTitle(date, difficulty);
      this.renderPuzzle();
    });
  }

  renderPuzzle() {
    const size = this.puzzle.s;
    this.style.setProperty('--size', size);
    this.reset();
    const cells = this.puzzle.d.map((row,x)=>`
      ${row.map((cell,y)=>`
        <castling-cell data-x="${x}" data-y="${y}" data-slv="${(cell[1] * size) + cell[2]}" data-distance="${cell[0]}" class="${(x+y)%2 ? 'odd' : 'even'}">
          <span class="distance">${cell[0]}</span>
        </castling-cell>
      `).join('')}
    `).join('');
    const walls = this.puzzle.m !== 'walls' ? '' : (
      this.puzzle.x[0].map((row,x)=>`
        ${row.map((cell,y)=>
          cell ? `<castling-wall data-direction="v" data-x="${x}" data-y="${y}" style="--wall-x: ${x}; --wall-y: ${y};" /></castling-wall>` : ''
        ).join('')}
      `).join('') + 
      this.puzzle.x[1].map((column,x)=>`
        ${column.map((cell,y)=>
          cell ? `<castling-wall data-direction="h" data-x="${x}" data-y="${y}" style="--wall-x: ${x}; --wall-y: ${y};" ></castling-wall>` : ''
        ).join('')}
      `).join('')
    );
    this.innerHTML = cells + walls;
  }

  indicateValidMoves(){
    // Apply special class if we've solved it already:
    this.classList.toggle('solved', this.isSolved());
    // We only show valid moves if moves have been made, never on an empty board:
    const showValidMoves = this.path.length > 0;
    // Otherwise, indicate valid moves:
    this.querySelectorAll('castling-cell').forEach(cell=>
      cell.classList.toggle('valid', showValidMoves && this.isValidMove(cell))
    );
    // Also indicate current cell as overlay:
    this.classList.toggle('has-current-cell', showValidMoves);
    const currentCell = this.currentCell();
    if( ! currentCell ) return;
    this.style.setProperty('--current-cell-x', currentCell.dataset.x);
    this.style.setProperty('--current-cell-y', currentCell.dataset.y);
  }

  isValidMove(cell){
    const currentCell = this.currentCell();
    if( ! currentCell ) return true; // when there's no current cell, any move is valid
    // Rule #1: must be orthogally-aligned to the current cell:
    if( currentCell.dataset.x != cell.dataset.x && currentCell.dataset.y != cell.dataset.y ) return false;
    // Rule #2: must be correct distance away:
    const allowedDistance = this.currentCell().dataset.distance;
    const distance = this.currentCell().distanceTo(cell);
    if( distance != allowedDistance ) return false;
    // Rule #3: if all cells are on the path and the target cell is the START cell, then this move is valid (and solves the puzzle!)
    if( this.path.length == (this.puzzle.s ** 2) && cell.classList.contains('start') ) return true;
    // Rule #4: must not be on something already hit (which includes the current cell, of course):
    if( cell.classList.contains('on-path') ) return false;
    // Rule #5: must not involve traversing a wall:
    if( currentCell.dataset.x == cell.dataset.x ) {
      const potentialWallValuesY = Array( Math.abs( currentCell.dataset.y - cell.dataset.y ) ).keys().map(y=>Math.min( currentCell.dataset.y, cell.dataset.y ) + y);
      for( const y of potentialWallValuesY ) {
        if( this.querySelector(`castling-wall[data-direction="v"][data-x="${currentCell.dataset.x}"][data-y="${y}"]`) ) return false;
      }
    } else if( currentCell.dataset.y == cell.dataset.y ) {
      const potentialWallValuesX = Array( Math.abs( currentCell.dataset.x - cell.dataset.x ) ).keys().map(x=>Math.min( currentCell.dataset.x, cell.dataset.x ) + x);
      for( const x of potentialWallValuesX ) {
        if( this.querySelector(`castling-wall[data-direction="h"][data-x="${x}"][data-y="${currentCell.dataset.y}"]`) ) return false;
      }
    }
    // Okay, looks good!
    return true;
  }
  
  startFromRandomCell(){
    if( this.isSolved() || ! this.allowMoves ) return;
    if( this.path.length > 1 ) return; // can't do a random start if there are already moves (ignoring entering the board)
    // Select a random cell that isn't the current start cell (if there is one) - humans don't think it's random when you pick the square you/they just did:
    const cells = Array.from(this.querySelectorAll('castling-cell:not(.start)'));
    cells.sort(()=>Math.random() - 0.5);
    // Reset the board and start there:
    this.reset();
    cells[0].click();
  }

  currentCell(){
    return this.path[this.path.length - 1];
  }

  cellsMarkedValid(){
    return Array.from(this.querySelectorAll('castling-cell.valid'));
  }

  moveUp(){
    const proposedMove = this.cellsMarkedValid().find(cell=>cell.dataset.x < this.currentCell().dataset.x);
    if( proposedMove ) proposedMove.click();
  }

  moveDown(){
    const proposedMove = this.cellsMarkedValid().find(cell=>cell.dataset.x > this.currentCell().dataset.x);
    if( proposedMove ) proposedMove.click();
  }

  moveLeft(){
    const proposedMove = this.cellsMarkedValid().find(cell=>cell.dataset.y < this.currentCell().dataset.y);
    if( proposedMove ) proposedMove.click();
  }

  moveRight(){
    const proposedMove = this.cellsMarkedValid().find(cell=>cell.dataset.y > this.currentCell().dataset.y);
    if( proposedMove ) proposedMove.click();
  }

  undo(){
    if( this.isSolved() ) return; // when the puzzle is solved, don't allow undoing
    if( ! this.allowMoves ) return; // when moves are disallowed, stop right here!
    const currentCell = this.currentCell();
    if( ! currentCell ) return;
    currentCell.removeFromPath();
    if( this.path.length == 1 ) {
      currentCell.classList.remove('start'); // removing final item will also remove start flag
    }
    this.path.pop();
    if( this.path.length > 0 ) {
      // If there are moves left, the current cell is the last move:
      this.path[this.path.length - 1].makeCurrent();
    }
    this.indicateValidMoves();
  }

  reset(){
    this.path = [];
    this.allowMoves = true;
    this.classList.remove('has-current-cell');
    document.querySelectorAll('castling-cell').forEach(cell=>cell.classList.remove('on-path', 'current', 'start'));
    this.indicateValidMoves();
  }

  isSolved(){
    return this.path.length == ((this.puzzle.s ** 2) + 1) && this.currentCell().classList.contains('start');
  }

  giveUp(){
    this.reset();
    this.allowMoves = false;
    clearInterval(this.autoSolver);
    this.autoSolver = setInterval(()=>{
      if( this.isSolved() ) {
        clearInterval(this.autoSolver);
        this.allowMoves = true;
      } else if( this.path == 0 ) {
        // solver: make first move randomly by getting the entire grid as an array and shuffling it:
        const cells = Array.from(this.querySelectorAll('castling-cell'));
        cells.sort(()=>Math.random() - 0.5);
        this.allowMoves = true;
        cells[0].click();
        this.allowMoves = false;
      } else {
        // solver: make the next move on the chain:
        const nextCell = this.querySelectorAll('castling-cell')[this.currentCell().dataset.slv];
        this.allowMoves = true;
        nextCell.click();
        this.allowMoves = false;
      }
    }, 500);
  }

  connectedCallback() {
    this.loadPuzzle(today, 0);

    this.addEventListener('click', e=>{
      const cell = e.target.closest('castling-cell');
      if( ! cell ) return;
      e.preventDefault();
      if( this.isSolved() || ! this.allowMoves ) return; // when moves are disallowed, stop right here!
      const currentCell = this.currentCell();
      if( ! currentCell ) {
        // This is the first click, so it can be anywhere!
        cell.addToPath();
        cell.makeCurrent();
        cell.makeStart();
        this.path = [cell];
      } else if( currentCell == cell ) {
        // Clicking the current cell "undoes" the move:
        return this.undo();
      } else {
        // Subsequent clicks must follow the rules: not on something already hit, must be the right distance away
        if( ! this.isValidMove(cell) ) {
          cell.flashInvalid();
          return;
        };
        // Rules passed!
        cell.addToPath();
        currentCell.removeCurrent();
        cell.makeCurrent();
        this.path.push(cell);
      }
      // Indicate valid moves:
      this.indicateValidMoves();
    });
  }
}
customElements.define('castling-grid', CastlingGrid);

/** 
 * Level selector
 */
class CastlingSelector extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    this.addEventListener('click', e=>{
      const button = e.target.closest('button');
      if( ! button ) return;
      e.preventDefault();
      if( button.dataset.difficulty ) return castlingGrid.loadPuzzle(today, parseInt(button.dataset.difficulty));
    });
  }
}
customElements.define('castling-selector', CastlingSelector);

/**
 * Get a handle on tthe grid:
 */
const castlingGrid = document.querySelector('castling-grid');

/**
 * Keyboard shortcuts:
 */
document.addEventListener('keydown', e=>{
  let intercepted = true;
  if( e.key == 'ArrowUp' ) {
    // Move up
    castlingGrid.moveUp();
  } else if( e.key == 'ArrowDown' ) {
    // Move down
    castlingGrid.moveDown();
  } else if( e.key == 'ArrowLeft' ) {
    // Move left
    castlingGrid.moveLeft();
  } else if( e.key == 'ArrowRight' ) {
    // Move right
    castlingGrid.moveRight();
  } else if( e.key == 'z' ) {
    castlingGrid.undo();
  } else if( e.key == 's' ) {
    // Start from a random cell:
    castlingGrid.startFromRandomCell();
  } else if( e.key == '1' || e.key == '2' || e.key == '3' ) {
    // Switch puzzle/difficulty:
    document.querySelector(`castling-selector button[data-difficulty="${(parseInt(e.key)-1)}"]`).click();
  } else {
    intercepted = false;
  }
  if( intercepted ) e.preventDefault();
});
