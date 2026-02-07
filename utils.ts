
import { Project, Employee, WorkLog, AppSettings, CashFlowCategory, ProjectStatus, RevenueRecognitionMethod } from './types';

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(amount);
};

export const generateId = () => {
  return Math.random().toString(36).substr(2, 9);
};

// --- Date Helpers ---

// Helper: Parse YYYY-MM-DD to Local Date (00:00:00) to avoid UTC offsets
export const parseLocalDate = (dateStr: string): Date => {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const getTermDateRange = (termYear: number) => {
  const start = new Date(termYear - 1, 11, 1); // Dec 1
  const end = new Date(termYear, 10, 30); // Nov 30
  return { start, end };
};

export const getTermMonthsWithWeeks = (termYear: number) => {
  const { start, end } = getTermDateRange(termYear);
  const months = [];
  
  let currentMonthStart = new Date(start);
  
  while (currentMonthStart <= end) {
    const monthLabel = `${currentMonthStart.getMonth() + 1}月`;
    const yearMonth = `${currentMonthStart.getFullYear()}-${String(currentMonthStart.getMonth()+1).padStart(2,'0')}`;
    const nextMonth = new Date(currentMonthStart);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    
    months.push({
      dateObj: new Date(currentMonthStart),
      label: monthLabel,
      yearMonth,
      weeks: [] as any[]
    });
    
    currentMonthStart = nextMonth;
  }

  let current = new Date(start);
  const day = current.getDay();
  const diff = current.getDate() - day + (day === 0 ? -6 : 1); // Monday
  current.setDate(diff);

  while (current <= end) {
    const weekStart = new Date(current);
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 4); // Friday
    
    if (weekEnd >= start) {
        const monthKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth()+1).padStart(2,'0')}`;
        let targetMonth = months.find(m => m.yearMonth === monthKey);
        
        if (!targetMonth && weekStart < start) {
             targetMonth = months[0];
        }

        if (targetMonth) {
            targetMonth.weeks.push({
                label: `${weekStart.getMonth()+1}/${weekStart.getDate()}~${weekEnd.getDate()}`,
                startDate: weekStart.toISOString().split('T')[0],
                weekNum: targetMonth.weeks.length + 1
            });
        }
    }
    current.setDate(current.getDate() + 7);
  }
  return months;
};

// Helper: Calculate Exact Months (Simple duration based on days / 30.44)
export const calculateExactMonths = (startStr: string, endStr: string): number => {
    if (!startStr || !endStr) return 0;
    const start = parseLocalDate(startStr);
    const end = parseLocalDate(endStr);
    
    if (start > end) return 0;

    // Calculate difference in milliseconds
    const diffTime = Math.abs(end.getTime() - start.getTime());
    // Convert to days
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Average days per month (365.25 / 12 = 30.4375)
    // Using 30.44 for approximation
    const months = diffDays / 30.44;
    
    // Round to 1 decimal place
    return Math.round(months * 10) / 10;
};

// Helper to calculate duration in months
export const getDurationMonths = (startStr: string, endStr: string): number => {
    return calculateExactMonths(startStr, endStr);
};

// Helper: Get overlap days between a target month and a date range
export const getMonthOverlapDays = (targetYear: number, targetMonth: number, rangeStartStr: string, rangeEndStr: string): number => {
  const rangeStart = parseLocalDate(rangeStartStr);
  const rangeEnd = parseLocalDate(rangeEndStr);
  
  const monthStart = new Date(targetYear, targetMonth, 1);
  const monthEnd = new Date(targetYear, targetMonth + 1, 0); // Last day of month

  // Overlap Start = Max(rangeStart, monthStart)
  const overlapStart = rangeStart > monthStart ? rangeStart : monthStart;
  // Overlap End = Min(rangeEnd, monthEnd)
  const overlapEnd = rangeEnd < monthEnd ? rangeEnd : monthEnd;

  if (overlapStart > overlapEnd) return 0;

  // Calculate difference in days (add 1 to include both start and end dates)
  const diffTime = Math.abs(overlapEnd.getTime() - overlapStart.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  
  return diffDays;
};

export const getTotalDays = (year: number, month: number) => {
  return new Date(year, month + 1, 0).getDate();
};

export const getEmployeeMonthlyData = (employee: Employee, year: number, month: number) => {
  const key = `${year}-${String(month + 1).padStart(2, '0')}`;
  const data = employee.monthlyData[key];
  return {
    cost: data?.cost ?? employee.defaultMonthlyCost,
    monthlyHours: data?.monthlyHours ?? employee.defaultMonthlyHours
  };
};

export const getProjectMonthlyCost = (project: Project, employees: Employee[], year: number, month: number) => {
  // Plan based cost (Assignments)
  let cost = 0;
  const mStart = new Date(year, month, 1);
  const mEnd = new Date(year, month + 1, 0);

  // COST RESTRICTION LOGIC:
  // If Flow (Fixed Reward) is enabled, we assume assignments are for the Development Phase.
  // Therefore, cost is ONLY calculated if the current month overlaps with the Flow Duration.
  // This prevents cost from being calculated during the Maintenance (Stock only) phase.
  if (project.useFlow && project.flowStartDate && project.flowEndDate) {
      const s = parseLocalDate(project.flowStartDate);
      const e = parseLocalDate(project.flowEndDate);
      
      // If current month is outside the Flow period, return 0 cost.
      if (mEnd < s || mStart > e) {
          return 0;
      }
  } else if (!project.useFlow && project.useStock && project.stockStartDate) {
      // Pure Stock project: check start date
      const s = parseLocalDate(project.stockStartDate);
      if (mEnd < s) return 0;
  } else if (!project.useFlow && !project.useStock && !project.useTimeCharge) {
      // No active contract type
      return 0;
  }

  project.assignments.forEach(assign => {
      const emp = employees.find(e => e.id === assign.employeeId);
      if (emp) {
          const { cost: empCost } = getEmployeeMonthlyData(emp, year, month);
          // Utilization Rate is percentage (0-100)
          // Simple calc: MonthlyCost * Utilization.
          cost += empCost * (assign.utilizationRate / 100);
      }
  });
  
  return Math.floor(cost);
};

export const getProjectActualCost = (project: Project, employees: Employee[], workLogs: WorkLog[], year: number, month: number) => {
    let cost = 0;
    const targetLogs = workLogs.filter(l => {
        if (l.projectId !== project.id) return false;
        const d = parseLocalDate(l.weekStartDate);
        return d.getFullYear() === year && d.getMonth() === month;
    });

    targetLogs.forEach(log => {
        const emp = employees.find(e => e.id === log.employeeId);
        if (emp) {
            const { cost: empCost, monthlyHours } = getEmployeeMonthlyData(emp, year, month);
            const hourlyRate = monthlyHours > 0 ? empCost / monthlyHours : 0;
            cost += log.actualHours * hourlyRate;
        }
    });

    return Math.floor(cost);
};

export const getMonthlyRevenue = (project: Project, date: Date) => {
    let revenue = 0;
    const year = date.getFullYear();
    const month = date.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const mStart = new Date(year, month, 1);
    const mEnd = new Date(year, month + 1, 0);

    // 1. Flow Revenue
    if (project.useFlow && project.flowStartDate && project.flowEndDate) {
        const s = parseLocalDate(project.flowStartDate);
        const e = parseLocalDate(project.flowEndDate);
        
        // Revenue Recognition Logic
        if (project.revenueMethod === RevenueRecognitionMethod.Milestone) {
            // Billing Basis
            // Start Portion
            if (s.getFullYear() === year && s.getMonth() === month) {
                 const ratio = project.billingConfig.flowStartRatio || 0;
                 if (project.billingConfig.flowSplit) {
                     // Ensure integer
                     revenue += Math.floor(project.flowAmount * (ratio / 100));
                 }
            }
            // End Portion
            if (e.getFullYear() === year && e.getMonth() === month) {
                if (project.billingConfig.flowSplit) {
                    const ratio = project.billingConfig.flowStartRatio || 0;
                    // Calculate start amount same as above to ensure exact remainder
                    const startAmount = Math.floor(project.flowAmount * (ratio / 100));
                    revenue += (project.flowAmount - startAmount);
                } else {
                    revenue += project.flowAmount;
                }
            }

        } else {
            // Duration Basis (Monthly Leveling)
            // Logic: Prorate equally among all integer months touched by the period.
            // We need strict start and end months for the logic to identify "last month" correctly.
            const startMonthIndex = s.getFullYear() * 12 + s.getMonth();
            const endMonthIndex = e.getFullYear() * 12 + e.getMonth();
            const currentMonthIndex = year * 12 + month;

            if (currentMonthIndex >= startMonthIndex && currentMonthIndex <= endMonthIndex) {
                const totalMonths = endMonthIndex - startMonthIndex + 1;
                
                if (totalMonths > 0) {
                     const baseAmount = Math.floor(project.flowAmount / totalMonths);
                     const remainder = project.flowAmount % totalMonths;
                     
                     // Add remainder to the last month
                     if (currentMonthIndex === endMonthIndex) {
                         revenue += baseAmount + remainder;
                     } else {
                         revenue += baseAmount;
                     }
                }
            }
        }
    }

    // 2. Stock Revenue
    if (project.useStock && project.stockStartDate) {
        const s = parseLocalDate(project.stockStartDate);
        // Assume valid if start date <= month end
        // Simple monthly amount (No day proration) matches "Every month end fixed billing"
        if (s <= mEnd) {
             revenue += project.stockAmount;
        }
    }

    // 3. Time Charge
    if (project.useTimeCharge && project.timeChargePrices) {
        const amount = project.timeChargePrices[monthKey];
        if (amount) revenue += amount;
    }

    return Math.floor(revenue);
};

// Helper for cash flow payment dates
const getPaymentDate = (year: number, month: number, delay: number, day: number) => {
    // Add delay months
    let targetDate = new Date(year, month + delay, 1);
    
    // Set day
    if (day === 99) {
        // End of target month
        targetDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
    } else {
        targetDate.setDate(day);
    }
    return targetDate;
};

export const generateProjections = (projects: Project[], employees: Employee[], workLogs: WorkLog[], termStart: Date, settings: AppSettings) => {
    const data = [];
    let currentCash = settings.initialCashBalance;

    for (let i = 0; i < 12; i++) {
        const d = new Date(termStart.getFullYear(), termStart.getMonth() + i, 1);
        const year = d.getFullYear();
        const month = d.getMonth();
        const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
        
        // --- PL (Profit & Loss) ---
        let revenue = 0;
        let confirmedRevenue = 0;
        let potentialRevenue = 0;
        let flowRevenue = 0;
        let stockRevenue = 0;
        
        let cost = 0; // Labor cost

        // Determine if this month is in the "Past" relative to today for Cost Calculation
        // Rule: Before Current Month = Past (Actuals). Current Month & Future = Future (Plan).
        const today = new Date();
        const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const isPast = d < currentMonthStart;

        // Calculate Revenue & Cost from Projects
        projects.forEach(p => {
            // Revenue
            const rev = getMonthlyRevenue(p, d);
            revenue += rev;
            
            if (p.status === ProjectStatus.Ordered || p.status === ProjectStatus.Delivered) {
                confirmedRevenue += rev;
            } else if (p.status === ProjectStatus.PreOrder) {
                potentialRevenue += rev;
            }

            // Approximate Flow/Stock Split
            let sPart = 0;
            if (p.useStock) sPart = p.stockAmount || 0;
            // Cap stock part to actual revenue
            if (rev < sPart) sPart = rev;
            
            // If project is pure stock, rev is stock. If hybrid, remove stock amount to find flow.
            if (p.useStock && !p.useFlow) {
                sPart = rev;
            } else if (p.useStock && p.useFlow) {
                // If Stock is active this month, Stock amount is fixed. Flow is the rest.
                const s = parseLocalDate(p.stockStartDate);
                const mEnd = new Date(year, month + 1, 0);
                if (s <= mEnd) {
                    sPart = p.stockAmount;
                } else {
                    sPart = 0;
                }
            }

            stockRevenue += sPart;
            flowRevenue += (rev - sPart);

            // Cost (Labor)
            // Use Actuals for Past, Plan for Current/Future
            if (isPast) {
                 cost += getProjectActualCost(p, employees, workLogs, year, month);
            } else {
                 cost += getProjectMonthlyCost(p, employees, year, month);
            }
        });

        const target = settings.salesTargets[monthKey] || settings.monthlySalesTarget || 0;

        // --- CF (Cash Flow) ---
        let cashIn = 0;
        
        projects.forEach(p => {
             // Flow Payment
             if (p.useFlow) {
                 const { flowSplit, flowStartRatio, flowStartDelay, flowStartPayDay, flowEndDelay, flowEndPayDay } = p.billingConfig;
                 
                 // Start Payment Date
                 if (p.flowStartDate) {
                     const s = parseLocalDate(p.flowStartDate);
                     const sPayDate = getPaymentDate(s.getFullYear(), s.getMonth(), flowStartDelay || 0, flowStartPayDay || 99);
                     
                     if (sPayDate.getFullYear() === year && sPayDate.getMonth() === month) {
                         const ratio = flowSplit ? (flowStartRatio || 0) / 100 : 0; 
                         if (flowSplit) {
                             cashIn += p.flowAmount * ratio;
                         }
                     }
                 }

                 // End Payment Date
                 if (p.flowEndDate) {
                     const e = parseLocalDate(p.flowEndDate);
                     const ePayDate = getPaymentDate(e.getFullYear(), e.getMonth(), flowEndDelay || 0, flowEndPayDay || 99);
                     
                     if (ePayDate.getFullYear() === year && ePayDate.getMonth() === month) {
                         if (flowSplit) {
                             const ratio = (100 - (flowStartRatio || 0)) / 100;
                             cashIn += p.flowAmount * ratio;
                         } else {
                             cashIn += p.flowAmount;
                         }
                     }
                 }
             }

             // Stock & Time Charge Payment
             if ((p.useStock && p.stockStartDate) || p.useTimeCharge) {
                 const delay = p.billingConfig.stockDelay || 0;
                 const targetRevenueMonth = new Date(year, month - delay, 1);
                 
                 const rev = getMonthlyRevenue(p, targetRevenueMonth);
                 if (rev > 0) {
                     cashIn += rev;
                 }
             }
        });
        
        // Add Consumption Tax (10%) to Cash In
        cashIn = Math.floor(cashIn * 1.1);

        // Cash Out: Expenses
        // 1. Labor Cost (Calculated above). Usually paid next month.
        let paidCost = 0;
        const prevMonth = new Date(year, month - 1, 1);
        let totalLaborCostPrevMonth = 0;
        
        // Determine "Past" for previous month to decide if we pay Actual or Plan
        const isPrevPast = prevMonth < currentMonthStart;
        
        projects.forEach(p => {
             if (isPrevPast) {
                 totalLaborCostPrevMonth += getProjectActualCost(p, employees, workLogs, prevMonth.getFullYear(), prevMonth.getMonth());
             } else {
                 totalLaborCostPrevMonth += getProjectMonthlyCost(p, employees, prevMonth.getFullYear(), prevMonth.getMonth());
             }
        });
        paidCost = totalLaborCostPrevMonth;

        // 2. SG&A and Others
        let sga = 0;
        let taxRepayment = 0;
        let investment = 0;
        let financialIn = 0;

        settings.cashFlowItems.forEach(item => {
            let occurs = false;
            if (item.isRecurring) {
                if (item.periodStart) {
                    const start = parseLocalDate(`${item.periodStart}-01`);
                    const end = item.periodEnd ? parseLocalDate(`${item.periodEnd}-01`) : new Date(9999, 11, 31);
                    if (d >= start && d <= end) occurs = true;
                }
            } else {
                const pDate = item.paymentDate ? parseLocalDate(item.paymentDate) : (item.targetMonth ? parseLocalDate(`${item.targetMonth}-01`) : null);
                if (pDate && pDate.getFullYear() === year && pDate.getMonth() === month) occurs = true;
            }

            if (occurs) {
                if (item.category === CashFlowCategory.OperatingExpense) sga += item.amount;
                else if (item.category === CashFlowCategory.Tax || item.category === CashFlowCategory.LoanRepayment) taxRepayment += item.amount;
                else if (item.category === CashFlowCategory.Investment) investment += item.amount;
                else if (item.category === CashFlowCategory.LoanIn) financialIn += item.amount;
                else sga += item.amount;
            }
        });

        const totalCashIn = cashIn + financialIn;
        const totalCashOut = paidCost + sga + taxRepayment + investment;
        
        const cashBalanceChange = totalCashIn - totalCashOut;
        currentCash += cashBalanceChange;

        data.push({
            month: `${month + 1}月`,
            date: d,
            revenue,
            target,
            confirmedRevenue,
            potentialRevenue,
            flowRevenue,
            stockRevenue,
            cost: paidCost,
            sga,
            taxRepayment,
            investment,
            cashIn,
            financialIn,
            totalCashIn,
            totalCashOut,
            cashBalance: currentCash,
            cashBalanceChange
        });
    }
    
    return data;
};

export const generateDailyCashFlow = (date: Date, projects: Project[], settings: AppSettings, initialBalance: number) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = getTotalDays(year, month);
    const data = [];
    let currentBalance = initialBalance;
    
    const dailyChanges: Record<number, number> = {};

    // Projects
    projects.forEach(p => {
        if (p.useFlow) {
             const { flowSplit, flowStartRatio, flowStartDelay, flowStartPayDay, flowEndDelay, flowEndPayDay } = p.billingConfig;
             
             if (p.flowStartDate) {
                 const s = parseLocalDate(p.flowStartDate);
                 const sPayDate = getPaymentDate(s.getFullYear(), s.getMonth(), flowStartDelay || 0, flowStartPayDay || 99);
                 if (sPayDate.getFullYear() === year && sPayDate.getMonth() === month) {
                     const amt = flowSplit ? p.flowAmount * ((flowStartRatio||0)/100) : 0;
                     if (amt > 0) dailyChanges[sPayDate.getDate()] = (dailyChanges[sPayDate.getDate()] || 0) + Math.floor(amt * 1.1);
                 }
             }
             if (p.flowEndDate) {
                 const e = parseLocalDate(p.flowEndDate);
                 const ePayDate = getPaymentDate(e.getFullYear(), e.getMonth(), flowEndDelay || 0, flowEndPayDay || 99);
                 if (ePayDate.getFullYear() === year && ePayDate.getMonth() === month) {
                     const amt = flowSplit ? p.flowAmount * ((100-(flowStartRatio||0))/100) : p.flowAmount;
                     if (amt > 0) dailyChanges[ePayDate.getDate()] = (dailyChanges[ePayDate.getDate()] || 0) + Math.floor(amt * 1.1);
                 }
             }
        }
        
        if ((p.useStock && p.stockStartDate) || p.useTimeCharge) {
             const delay = p.billingConfig.stockDelay || 0;
             const payDay = p.billingConfig.stockPayDay || 99;
             const targetRevMonth = new Date(year, month - delay, 1);
             const rev = getMonthlyRevenue(p, targetRevMonth);
             
             if (rev > 0) {
                 const d = getPaymentDate(targetRevMonth.getFullYear(), targetRevMonth.getMonth(), delay, payDay);
                 if (d.getFullYear() === year && d.getMonth() === month) {
                     dailyChanges[d.getDate()] = (dailyChanges[d.getDate()] || 0) + Math.floor(rev * 1.1);
                 }
             }
        }
    });

    // CF Items
    settings.cashFlowItems.forEach(item => {
        let occurs = false;
        let day = 1;
        
        if (item.isRecurring) {
            if (item.periodStart) {
                const start = parseLocalDate(`${item.periodStart}-01`);
                const end = item.periodEnd ? parseLocalDate(`${item.periodEnd}-01`) : new Date(9999, 11, 31);
                const d = new Date(year, month, 1);
                if (d >= start && d <= end) {
                    occurs = true;
                    day = item.payDay === 99 ? daysInMonth : (item.payDay || 25);
                }
            }
        } else {
             const pDate = item.paymentDate ? parseLocalDate(item.paymentDate) : (item.targetMonth ? parseLocalDate(`${item.targetMonth}-01`) : null);
             if (pDate && pDate.getFullYear() === year && pDate.getMonth() === month) {
                 occurs = true;
                 day = pDate.getDate();
             }
        }

        if (occurs) {
            const sign = (item.category === CashFlowCategory.LoanIn) ? 1 : -1;
            dailyChanges[day] = (dailyChanges[day] || 0) + (item.amount * sign);
        }
    });
    
    for (let d = 1; d <= daysInMonth; d++) {
        const change = dailyChanges[d] || 0;
        currentBalance += change;
        data.push({
            day: d,
            change,
            balance: currentBalance
        });
    }
    
    return data;
};
