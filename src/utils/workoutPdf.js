/**
 * Workout Plan PDF Generator (React version)
 * Dynamically loads jsPDF from CDN and generates downloadable PDFs.
 */

let jsPDFLoaded = null;

async function loadJsPDF() {
  if (jsPDFLoaded) return jsPDFLoaded;
  if (window.jspdf) {
    jsPDFLoaded = window.jspdf.jsPDF;
    return jsPDFLoaded;
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js';
    script.onload = () => {
      jsPDFLoaded = window.jspdf.jsPDF;
      resolve(jsPDFLoaded);
    };
    script.onerror = () => reject(new Error('Failed to load jsPDF'));
    document.head.appendChild(script);
  });
}

// Colors
const BLACK = [0, 0, 0];
const WHITE = [255, 255, 255];
const BRAND_TEAL = [13, 148, 136];
const LIGHT_GRAY = [245, 245, 245];
const MEDIUM_GRAY = [200, 200, 200];
const DARK_GRAY = [80, 80, 80];

function truncateText(doc, text, maxWidth) {
  if (!text) return '';
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && doc.getTextWidth(t + '...') > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + '...';
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatProgramType(type) {
  const map = {
    hypertrophy: 'Muscle Growth / Hypertrophy',
    strength: 'Strength Training',
    endurance: 'Endurance',
    weight_loss: 'Fat Loss',
    general: 'General Fitness',
    cardio: 'Cardio',
    hiit: 'HIIT',
    mobility: 'Mobility',
    full_body: 'Full Body'
  };
  return map[type?.toLowerCase()] || capitalize(type);
}

function drawTableHeader(doc, x, y, colWidths, labels) {
  const totalWidth = colWidths.reduce((s, w) => s + w, 0);
  doc.setFillColor(50, 50, 50);
  doc.rect(x, y, totalWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...WHITE);

  let xPos = x;
  labels.forEach((label, i) => {
    const isCenter = i === 0 || i >= 3;
    if (isCenter) {
      doc.text(label, xPos + colWidths[i] / 2, y + 5, { align: 'center' });
    } else {
      doc.text(label, xPos + 2, y + 5);
    }
    xPos += colWidths[i];
  });
}

/**
 * Generate and download a PDF for a workout program.
 * @param {Object} program
 * @param {Object} options
 * @param {boolean} options.compact
 * @param {boolean} options.includeNotes
 * @param {boolean} options.separateDays
 */
export async function generateWorkoutPDF(program, options = {}) {
  const { compact = true, includeNotes = true, separateDays = false } = options;

  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;

  let y = margin;

  function checkPageBreak(needed) {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
      return true;
    }
    return false;
  }

  // Header
  doc.setFillColor(...BRAND_TEAL);
  doc.rect(margin, y, contentWidth, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...WHITE);
  doc.text('Training Plan', margin + 4, y + 7);
  const programName = program.name || 'Workout Program';
  doc.setFontSize(12);
  doc.text(programName, pageWidth / 2, y + 7, { align: 'center' });
  y += 10;

  // Info rows
  const programType = program.program_type || program.programType || '';
  const difficulty = program.difficulty || '';
  const days = program.program_data?.days || [];
  const daysPerWeek = program.days_per_week || days.length || '';
  const description = program.description || '';

  const infoRows = [];
  if (programType) infoRows.push(['Goal', formatProgramType(programType)]);
  if (difficulty) infoRows.push(['Level', capitalize(difficulty)]);
  if (daysPerWeek) infoRows.push(['Days/Week', String(daysPerWeek)]);
  if (description) infoRows.push(['Instructions', description]);

  if (infoRows.length > 0) {
    doc.setFontSize(9);
    infoRows.forEach(([label, value]) => {
      doc.setFillColor(...LIGHT_GRAY);
      doc.rect(margin, y, contentWidth, 6, 'F');
      doc.setDrawColor(...MEDIUM_GRAY);
      doc.rect(margin, y, contentWidth, 6, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BLACK);
      doc.text(label, margin + 3, y + 4);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...DARK_GRAY);
      const truncatedValue = doc.splitTextToSize(value, contentWidth - 35)[0] || value;
      doc.text(truncatedValue, margin + 32, y + 4);
      y += 6;
    });
  }
  y += 4;

  // Exercise tables per day
  days.forEach((day, dayIdx) => {
    const exercises = day.exercises || [];
    if (exercises.length === 0) return;

    if (separateDays && dayIdx > 0) {
      doc.addPage();
      y = margin;
    }

    checkPageBreak(20);

    // Day header
    doc.setFillColor(...BRAND_TEAL);
    doc.rect(margin, y, contentWidth, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...WHITE);
    doc.text(day.name || `Day ${dayIdx + 1}`, margin + 4, y + 5.5);
    doc.setFontSize(9);
    doc.text(`${exercises.length} exercise${exercises.length !== 1 ? 's' : ''}`, pageWidth - margin - 4, y + 5.5, { align: 'right' });
    y += 8;

    // Column header
    const colHeader = compact
      ? ['#', 'Exercise', 'Muscle Group', 'Sets', 'Reps/Duration', 'Rest']
      : ['#', 'Exercise', 'Muscle Group', 'Sets', 'Reps/Duration', 'Rest', 'Notes'];
    const colWidths = compact
      ? [8, contentWidth - 88, 30, 14, 22, 14]
      : [8, contentWidth - 118, 28, 12, 20, 12, 38];

    drawTableHeader(doc, margin, y, colWidths, colHeader);
    y += 7;

    // Exercise rows
    exercises.forEach((ex, exIdx) => {
      const rowHeight = compact ? 8 : (includeNotes && ex.notes ? 14 : 8);
      checkPageBreak(rowHeight + 2);

      const bgColor = exIdx % 2 === 0 ? WHITE : LIGHT_GRAY;
      doc.setFillColor(...bgColor);
      doc.rect(margin, y, contentWidth, rowHeight, 'F');
      doc.setDrawColor(...MEDIUM_GRAY);
      doc.rect(margin, y, contentWidth, rowHeight, 'S');

      // Vertical lines
      let xPos = margin;
      colWidths.forEach((w, i) => {
        if (i > 0) doc.line(xPos, y, xPos, y + rowHeight);
        xPos += w;
      });

      doc.setFontSize(8);
      doc.setTextColor(...BLACK);
      let x = margin;

      // #
      doc.setFont('helvetica', 'bold');
      doc.text(String(exIdx + 1), x + colWidths[0] / 2, y + 5, { align: 'center' });
      x += colWidths[0];

      // Exercise name
      let nameStr = ex.name || 'Unknown Exercise';
      if (ex.isSuperset && ex.supersetGroup) nameStr = `[SS-${ex.supersetGroup}] ${nameStr}`;
      if (ex.isWarmup) nameStr = `[W] ${nameStr}`;
      if (ex.isStretch) nameStr = `[S] ${nameStr}`;
      doc.setFont('helvetica', 'bold');
      doc.text(truncateText(doc, nameStr, colWidths[1] - 4), x + 2, y + 5);
      x += colWidths[1];

      // Muscle Group
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...DARK_GRAY);
      const muscle = ex.muscle_group || ex.muscleGroup || '';
      doc.text(truncateText(doc, capitalize(muscle), colWidths[2] - 4), x + 2, y + 5);
      x += colWidths[2];

      // Sets
      doc.setTextColor(...BLACK);
      doc.text(String(ex.sets || '-'), x + colWidths[3] / 2, y + 5, { align: 'center' });
      x += colWidths[3];

      // Reps/Duration
      let repsText = '';
      if (ex.trackingType === 'time') {
        repsText = `${ex.duration || 30}s`;
      } else if (ex.trackingType === 'distance') {
        const unit = ex.distanceUnit === 'km' ? 'km' : ex.distanceUnit === 'meters' ? 'm' : 'mi';
        repsText = `${ex.distance || 1} ${unit}`;
      } else {
        repsText = String(ex.reps || '-');
      }
      doc.text(repsText, x + colWidths[4] / 2, y + 5, { align: 'center' });
      x += colWidths[4];

      // Rest
      const restVal = ex.restSeconds != null ? ex.restSeconds : 90;
      const restText = restVal >= 60 ? `${Math.floor(restVal / 60)}:${String(restVal % 60).padStart(2, '0')}` : `${restVal}s`;
      doc.text(restText, x + colWidths[5] / 2, y + 5, { align: 'center' });
      x += colWidths[5];

      // Notes column (non-compact)
      if (!compact && colWidths[6] && ex.notes) {
        doc.setFontSize(7);
        doc.setTextColor(...DARK_GRAY);
        doc.text(truncateText(doc, ex.notes, colWidths[6] - 4), x + 2, y + 5);
      }

      // Inline notes (compact)
      if (compact && includeNotes && ex.notes) {
        y += rowHeight;
        checkPageBreak(6);
        doc.setFillColor(...bgColor);
        doc.rect(margin, y, contentWidth, 6, 'F');
        doc.setDrawColor(...MEDIUM_GRAY);
        doc.rect(margin, y, contentWidth, 6, 'S');
        doc.setFontSize(7);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(...DARK_GRAY);
        doc.text(truncateText(doc, `Coach note: ${ex.notes}`, contentWidth - 10), margin + colWidths[0] + 2, y + 4);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
      }

      y += (compact && includeNotes && ex.notes) ? 6 : rowHeight;
    });

    y += 6;
  });

  // Footer on all pages
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...MEDIUM_GRAY);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
    doc.text('Zique Fitness', pageWidth - margin, pageHeight - 5, { align: 'right' });
  }

  const safeName = (program.name || 'workout-plan').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  doc.save(`${safeName}.pdf`);
}
