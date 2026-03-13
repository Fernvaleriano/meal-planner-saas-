/**
 * Workout Plan PDF Generator
 * Uses jsPDF to create downloadable PDF versions of workout plans.
 * Styled to match a professional training plan layout with exercise tables.
 */

(function () {
    'use strict';

    // Colors
    const BLACK = [0, 0, 0];
    const WHITE = [255, 255, 255];
    const BRAND_TEAL = [13, 148, 136];
    const LIGHT_GRAY = [245, 245, 245];
    const MEDIUM_GRAY = [200, 200, 200];
    const DARK_GRAY = [80, 80, 80];

    /**
     * Generate and download a PDF for a workout program.
     * @param {Object} program - The workout program object
     * @param {string} program.name - Program name
     * @param {string} [program.description] - Program description
     * @param {string} [program.program_type] - Program type (hypertrophy, strength, etc.)
     * @param {string} [program.difficulty] - Difficulty level
     * @param {number} [program.days_per_week] - Days per week
     * @param {Object} program.program_data - The program data containing days/exercises
     * @param {Object} [options] - PDF generation options
     * @param {boolean} [options.compact=true] - Use compact layout
     * @param {boolean} [options.includeNotes=true] - Include coach notes
     * @param {boolean} [options.separateDays=false] - Each day on a new page
     */
    window.generateWorkoutPDF = async function (program, options = {}) {
        const {
            compact = true,
            includeNotes = true,
            separateDays = false
        } = options;

        if (typeof window.jspdf === 'undefined') {
            throw new Error('jsPDF library not loaded');
        }

        const { jsPDF } = window.jspdf;
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

        // ---- HEADER ----
        function drawHeader() {
            // Title bar
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
            if (programType) {
                infoRows.push(['Goal', formatProgramType(programType)]);
            }
            if (difficulty) {
                infoRows.push(['Level', capitalize(difficulty)]);
            }
            if (daysPerWeek) {
                infoRows.push(['Days/Week', String(daysPerWeek)]);
            }
            if (description) {
                infoRows.push(['Instructions', description]);
            }

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
                    const maxValueWidth = contentWidth - 35;
                    const truncatedValue = doc.splitTextToSize(value, maxValueWidth)[0] || value;
                    doc.text(truncatedValue, margin + 32, y + 4);

                    y += 6;
                });
            }

            y += 4;
        }

        drawHeader();

        // ---- EXERCISE TABLES (per day) ----
        const days = program.program_data?.days || [];

        days.forEach((day, dayIdx) => {
            const exercises = day.exercises || [];
            if (exercises.length === 0) return;

            if (separateDays && dayIdx > 0) {
                doc.addPage();
                y = margin;
            }

            // Calculate needed space for day header + at least one exercise row
            const minNeeded = 20;
            checkPageBreak(minNeeded);

            // Day header
            doc.setFillColor(...BRAND_TEAL);
            doc.rect(margin, y, contentWidth, 8, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(...WHITE);
            doc.text(day.name || `Day ${dayIdx + 1}`, margin + 4, y + 5.5);

            // Show total exercises on the right
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

                // Draw vertical lines
                let xPos = margin;
                colWidths.forEach((w, i) => {
                    if (i > 0) {
                        doc.line(xPos, y, xPos, y + rowHeight);
                    }
                    xPos += w;
                });

                doc.setFontSize(8);
                doc.setTextColor(...BLACK);

                let x = margin;

                // # column
                doc.setFont('helvetica', 'bold');
                doc.text(String(exIdx + 1), x + colWidths[0] / 2, y + 5, { align: 'center' });
                x += colWidths[0];

                // Exercise name (with badges)
                doc.setFont('helvetica', 'bold');
                let nameStr = ex.name || 'Unknown Exercise';
                if (ex.isSuperset && ex.supersetGroup) {
                    nameStr = `[SS-${ex.supersetGroup}] ${nameStr}`;
                }
                if (ex.isWarmup) {
                    nameStr = `[W] ${nameStr}`;
                }
                if (ex.isStretch) {
                    nameStr = `[S] ${nameStr}`;
                }
                const maxNameWidth = colWidths[1] - 4;
                const truncName = truncateText(doc, nameStr, maxNameWidth);
                doc.text(truncName, x + 2, y + 5);
                x += colWidths[1];

                // Muscle Group
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...DARK_GRAY);
                const muscle = ex.muscle_group || ex.muscleGroup || '';
                const truncMuscle = truncateText(doc, capitalize(muscle), colWidths[2] - 4);
                doc.text(truncMuscle, x + 2, y + 5);
                x += colWidths[2];

                // Sets
                doc.setTextColor(...BLACK);
                doc.setFont('helvetica', 'normal');
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
                if (!compact && colWidths[6]) {
                    const noteText = ex.notes || '';
                    if (noteText) {
                        doc.setFontSize(7);
                        doc.setTextColor(...DARK_GRAY);
                        const truncNote = truncateText(doc, noteText, colWidths[6] - 4);
                        doc.text(truncNote, x + 2, y + 5);
                    }
                }

                // Notes row (compact mode with notes)
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
                    const noteStr = `Coach note: ${ex.notes}`;
                    const truncatedNote = truncateText(doc, noteStr, contentWidth - 10);
                    doc.text(truncatedNote, margin + colWidths[0] + 2, y + 4);

                    doc.setFontSize(8);
                    doc.setFont('helvetica', 'normal');
                }

                y += (compact && includeNotes && ex.notes) ? 6 : rowHeight;
            });

            y += 6;
        });

        // ---- FOOTER ----
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(...MEDIUM_GRAY);
            doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
            doc.text('Zique Fitness Nutrition', pageWidth - margin, pageHeight - 5, { align: 'right' });
        }

        // Download
        const safeName = (program.name || 'workout-plan').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        doc.save(`${safeName}.pdf`);
    };

    /**
     * Open a print dialog modal for PDF options, then generate.
     * @param {Object} program - The workout program object
     */
    window.openWorkoutPrintDialog = function (program) {
        if (!program || !program.program_data?.days?.length) {
            if (typeof showToast === 'function') {
                showToast('No workout data to download', 'error');
            } else {
                alert('No workout data to download');
            }
            return;
        }

        // Remove existing modal if any
        const existing = document.getElementById('pdfOptionsModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'pdfOptionsModal';
        modal.innerHTML = `
            <div class="pdf-modal-overlay" onclick="closePDFModal(event)">
                <div class="pdf-modal-content" onclick="event.stopPropagation()">
                    <div class="pdf-modal-header">
                        <h3>Print Plan</h3>
                        <button class="pdf-modal-close" onclick="closePDFModal()">&times;</button>
                    </div>
                    <div class="pdf-modal-body">
                        <div class="pdf-option-group">
                            <div class="pdf-layout-options">
                                <label class="pdf-layout-option">
                                    <input type="radio" name="pdfLayout" value="extensive" />
                                    <div class="pdf-layout-preview extensive">
                                        <div class="preview-row full"></div>
                                        <div class="preview-row full"></div>
                                        <div class="preview-row full"></div>
                                        <div class="preview-row full"></div>
                                    </div>
                                    <span>Extensive</span>
                                </label>
                                <label class="pdf-layout-option">
                                    <input type="radio" name="pdfLayout" value="compact" checked />
                                    <div class="pdf-layout-preview compact">
                                        <div class="preview-row half"></div><div class="preview-row half"></div>
                                        <div class="preview-row half"></div><div class="preview-row half"></div>
                                        <div class="preview-row half"></div><div class="preview-row half"></div>
                                    </div>
                                    <span>Compact</span>
                                </label>
                            </div>
                        </div>
                        <div class="pdf-option-group">
                            <label class="pdf-checkbox-option">
                                <input type="checkbox" id="pdfSeparateDays" />
                                <span>Print every day on a different page</span>
                            </label>
                            <label class="pdf-checkbox-option">
                                <input type="checkbox" id="pdfIncludeNotes" checked />
                                <span>Print exercise instructions</span>
                            </label>
                        </div>
                    </div>
                    <div class="pdf-modal-footer">
                        <button class="pdf-btn-cancel" onclick="closePDFModal()">Cancel</button>
                        <button class="pdf-btn-print" id="pdfGenerateBtn" onclick="handlePDFGenerate()">
                            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                            </svg>
                            Download PDF
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Store program reference
        modal._program = program;
        document.body.appendChild(modal);
    };

    window.closePDFModal = function (event) {
        if (event && event.target && !event.target.classList.contains('pdf-modal-overlay')) return;
        const modal = document.getElementById('pdfOptionsModal');
        if (modal) modal.remove();
    };

    window.handlePDFGenerate = async function () {
        const modal = document.getElementById('pdfOptionsModal');
        if (!modal) return;

        const program = modal._program;
        const layout = document.querySelector('input[name="pdfLayout"]:checked')?.value || 'compact';
        const separateDays = document.getElementById('pdfSeparateDays')?.checked || false;
        const includeNotes = document.getElementById('pdfIncludeNotes')?.checked || true;

        const btn = document.getElementById('pdfGenerateBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="pdf-spinner"></span> Generating...';

        try {
            await window.generateWorkoutPDF(program, {
                compact: layout === 'compact',
                includeNotes,
                separateDays
            });
            closePDFModal();
            if (typeof showToast === 'function') {
                showToast('PDF downloaded', 'success');
            }
        } catch (err) {
            console.error('PDF generation error:', err);
            if (typeof showToast === 'function') {
                showToast('Failed to generate PDF', 'error');
            }
            btn.disabled = false;
            btn.innerHTML = `
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                Download PDF`;
        }
    };

    // ---- Helper functions ----

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

    function truncateText(doc, text, maxWidth) {
        if (!text) return '';
        if (doc.getTextWidth(text) <= maxWidth) return text;
        let t = text;
        while (t.length > 0 && doc.getTextWidth(t + '...') > maxWidth) {
            t = t.slice(0, -1);
        }
        return t + '...';
    }

    function formatProgramType(type) {
        const map = {
            hypertrophy: 'Muscle Growth / Hypertrophy',
            strength: 'Strength Training',
            endurance: 'Endurance',
            weight_loss: 'Fat Loss',
            general: 'General Fitness'
        };
        return map[type] || capitalize(type);
    }

    function capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

})();
