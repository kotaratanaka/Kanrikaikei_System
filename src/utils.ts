
import { Project, Employee, WorkLog, AppSettings, CashFlowCategory, ProjectStatus, RevenueRecognitionMethod, EmployeeRole, CashFlowType, ContractType } from './types';

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

// Helper: Parse YYYY-MM-DD or YYYY/MM/DD to Local Date (00:00:00)
export const parseLocalDate = (dateStr: string): Date => {
  if (!dateStr) return new Date();
  // Handle both hyphens and slashes
  const standardized = dateStr.replace(/\//g, '-');
  const [y, m, d] = standardized.split('-').map(Number);
  // Guard against invalid dates
  if (isNaN(y) || isNaN(m) || isNaN(d)) return new Date();
  return new Date(y, m - 1, d);
};

// Helper: Calculate Day Difference between two dates
export const calculateDayDiff = (startStr?: string, endStr?: string): number | null => {
    if (!startStr || !endStr) return null;
    const s = parseLocalDate(startStr);
    const e = parseLocalDate(endStr);
    const diffTime = e.getTime() - s.getTime();
    // Return signed difference (negative if end is before start)
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
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

// Helper to get specifically Flow Revenue
// REVISED: Always uses Billing Basis (Milestone or Completion Date)
export const getMonthlyFlowRevenue = (project: Project, date: Date) => {
    let revenue = 0;
    const year = date.getFullYear();
    const month = date.getMonth();

    if (project.useFlow && project.flowStartDate && project.flowEndDate) {
        // Enforce Billing Basis Logic regardless of old 'revenueMethod' settings
        if (project.billingConfig.flowSplit && project.billingConfig.flowMilestones?.length > 0) {
             // Case A: Split Billing (Milestones)
             project.billingConfig.flowMilestones.forEach(m => {
                 const mDate = parseLocalDate(m.targetDate);
                 if (mDate.getFullYear() === year && mDate.getMonth() === month) {
                     revenue += m.amount;
                 }
             });
        } else {
             // Case B: Lump Sum at Completion (End Date)
             const e = parseLocalDate(project.flowEndDate);
             if (e.getFullYear() === year && e.getMonth() === month) {
                 revenue += project.flowAmount;
             }
        }
    }
    return Math.floor(revenue);
};

export const getMonthlyRevenue = (project: Project, date: Date) => {
    let revenue = 0;
    const year = date.getFullYear();
    const month = date.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const mEnd = new Date(year, month + 1, 0);
    const mStart = new Date(year, month, 1);

    // 1. Flow Revenue
    revenue += getMonthlyFlowRevenue(project, date);

    // 2. Stock Revenue
    if (project.useStock && project.stockStartDate) {
        const s = parseLocalDate(project.stockStartDate);
        
        let isWithinEnd = true;
        if (project.stockEndDate) {
            const e = parseLocalDate(project.stockEndDate);
            // If the current month starts after the end date, it's out of range
            if (mStart > e) isWithinEnd = false;
        }

        if (s <= mEnd && isWithinEnd) {
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

// Helper to calculate Senior Engineer Commission Amount (BONUS)
// Returns total commission amount for the project.
// Condition: Employee Role is SeniorEngineer. Amount is 5% of Flow Amount per person.
export const getSeniorEngineerCommission = (project: Project, employees: Employee[]): number => {
    if (!project.useFlow || !project.flowEndDate) return 0;
    
    // Find Senior Engineers assigned to this project
    const seniorEngCount = project.assignments.filter(a => {
        const emp = employees.find(e => e.id === a.employeeId);
        return emp?.role === EmployeeRole.SeniorEngineer;
    }).length;

    if (seniorEngCount === 0) return 0;

    // 5% of Total Flow Amount per Senior Engineer
    return Math.floor(project.flowAmount * 0.05 * seniorEngCount);
};

// ... existing helpers ...
export const getTotalDays = (year: number, month: number) => {
  return new Date(year, month + 1, 0).getDate();
};

export const getEmployeeMonthlyData = (employee: Employee, year: number, month: number) => {
  const key = `${year}-${String(month + 1).padStart(2, '0')}`;
  const data = employee.monthlyData[key];
  return {
    cost: data?.cost ?? employee.defaultMonthlyCost,
    monthlyHours: data?.monthlyHours ?? employee.defaultMonthlyHours,
    bonus: data?.bonus ?? 0
  };
};

// Renamed from getProjectMonthlyCost to differentiate Time-based cost vs Total cost (with commission)
export const getProjectTimeCost = (project: Project, employees: Employee[], year: number, month: number) => {
  let cost = 0;
  const mStart = new Date(year, month, 1);
  const mEnd = new Date(year, month + 1, 0);

  // Daily Proration Ratio (Default 1.0 = Full Month)
  let dateRatio = 1.0;

  if (project.useFlow && project.flowStartDate && project.flowEndDate) {
      const s = parseLocalDate(project.flowStartDate);
      const e = parseLocalDate(project.flowEndDate);
      
      // If outside the range completely
      if (mEnd < s || mStart > e) {
          return 0;
      }
      
      // Calculate overlap days
      const actualStart = s > mStart ? s : mStart;
      const actualEnd = e < mEnd ? e : mEnd;
      
      // getTime is ms. Calculate diff in days (inclusive +1)
      const diffTime = actualEnd.getTime() - actualStart.getTime();
      const overlapDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
      const daysInMonth = mEnd.getDate();
      
      // Calculate ratio
      if (overlapDays < daysInMonth) {
          dateRatio = overlapDays / daysInMonth;
      }

  } else if (!project.useFlow && project.useStock && project.stockStartDate) {
      const s = parseLocalDate(project.stockStartDate);
      if (mEnd < s) return 0;
      
      // Check stockEndDate
      if (project.stockEndDate) {
          const e = parseLocalDate(project.stockEndDate);
          if (mStart > e) return 0;
      }
  } else if (!project.useFlow && !project.useStock && !project.useTimeCharge) {
      return 0;
  }

  project.assignments.forEach(assign => {
      const emp = employees.find(e => e.id === assign.employeeId);
      if (emp) {
          const { cost: empCost } = getEmployeeMonthlyData(emp, year, month);
          // Cost = MonthlyCost * Utilization * DateRatio
          cost += empCost * (assign.utilizationRate / 100) * dateRatio;
      }
  });
  return Math.floor(cost);
};

// Wrapper for PL/Analytics to include Commission Cost
export const getProjectMonthlyCost = (project: Project, employees: Employee[], year: number, month: number) => {
    // 1. Base Time Cost (includes daily proration)
    let cost = getProjectTimeCost(project, employees, year, month);
    
    // 2. Add Senior Engineer Commission (5% of Flow Revenue)
    // Logic: Accrue 5% of Total Flow Amount AFTER Project Completion (Next Month)
    if (project.useFlow && project.flowEndDate) {
        const end = parseLocalDate(project.flowEndDate);
        const accrualMonth = new Date(end.getFullYear(), end.getMonth() + 1, 1);
        
        if (accrualMonth.getFullYear() === year && accrualMonth.getMonth() === month) {
             cost += getSeniorEngineerCommission(project, employees);
        }
    }
    
    return cost;
};

// Calculate Actual Cost based on Cost Allocation (配賦)
// Logic: Allocate Employee's Monthly Cost to projects based on Actual Hours worked
export const getProjectActualCost = (project: Project, employees: Employee[], workLogs: WorkLog[], year: number, month: number) => {
    let cost = 0;
    
    // 1. Identify all logs for THIS project in THIS month to find involved employees
    const projectLogs = workLogs.filter(l => 
        l.projectId === project.id && 
        parseLocalDate(l.weekStartDate).getFullYear() === year && 
        parseLocalDate(l.weekStartDate).getMonth() === month
    );
    
    // If no one worked on this project, no labor cost (unless commission)
    // Note: We'll add commission at the end regardless of hours if date matches
    const employeeIds = Array.from(new Set(projectLogs.map(l => l.employeeId)));

    employeeIds.forEach(empId => {
        const emp = employees.find(e => e.id === empId);
        if (!emp) return;

        // A. Calculate hours for THIS project by this employee
        const hoursOnProject = projectLogs
            .filter(l => l.employeeId === empId)
            .reduce((sum, l) => sum + l.actualHours, 0);

        // B. Calculate TOTAL hours for this employee in this month across ALL projects
        // This determines the denominator for allocation
        const allEmpLogs = workLogs.filter(l => 
            l.employeeId === empId &&
            parseLocalDate(l.weekStartDate).getFullYear() === year && 
            parseLocalDate(l.weekStartDate).getMonth() === month
        );
        const totalEmpHours = allEmpLogs.reduce((sum, l) => sum + l.actualHours, 0);

        // C. Allocate Cost
        // Formula: MonthlyCost * (ProjectHours / TotalHours)
        if (totalEmpHours > 0) {
            const { cost: monthlyCost } = getEmployeeMonthlyData(emp, year, month);
            const allocatedCost = monthlyCost * (hoursOnProject / totalEmpHours);
            cost += allocatedCost;
        }
    });

    // 2. Add Senior Engineer Commission (Fixed Reward logic)
    // Accrue based on NEXT MONTH of Completion Date
    if (project.useFlow && project.flowEndDate) {
        const end = parseLocalDate(project.flowEndDate);
        const accrualMonth = new Date(end.getFullYear(), end.getMonth() + 1, 1);
        
        if (accrualMonth.getFullYear() === year && accrualMonth.getMonth() === month) {
             cost += getSeniorEngineerCommission(project, employees);
        }
    }

    return Math.floor(cost);
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
        let revenueActual = 0;
        let revenueForecast = 0;
        let flowRevenue = 0;
        let stockRevenue = 0;
        
        let cost = 0; // Cost for PL (includes Accrued Commission)

        // Status check
        const today = new Date();
        const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const isChronologicallyPast = d < currentMonthStart;
        const hasLogs = workLogs.some(l => {
             const ld = parseLocalDate(l.weekStartDate);
             return ld.getFullYear() === year && ld.getMonth() === month && l.actualHours > 0;
        });
        const treatAsActualGlobal = isChronologicallyPast || hasLogs;

        // Calculate Revenue & Cost (PL)
        projects.forEach(p => {
            // REVISED: Exclude Lost projects completely from projections
            if (p.status === ProjectStatus.Lost) return;

            // Revenue
            const rev = getMonthlyRevenue(p, d);
            revenue += rev;
            
            const isConfirmed = p.status === ProjectStatus.Ordered || p.status === ProjectStatus.Delivered;

            if (isConfirmed) {
                confirmedRevenue += rev;
                if (p.status === ProjectStatus.Delivered || treatAsActualGlobal) {
                    revenueActual += rev;
                } else {
                    revenueForecast += rev;
                }
            } else if (p.status === ProjectStatus.PreOrder) {
                potentialRevenue += rev;
            }

            // Flow/Stock Split
            let sPart = 0;
            if (p.useStock) sPart = p.stockAmount || 0;
            if (rev < sPart) sPart = rev;
            
            // Refine split logic for hybrid projects
            if (p.useStock && !p.useFlow) {
                sPart = rev;
            } else if (p.useStock && p.useFlow) {
                const s = parseLocalDate(p.stockStartDate);
                const mEnd = new Date(year, month + 1, 0);
                const mStart = new Date(year, month, 1);
                
                let isWithinEnd = true;
                if (p.stockEndDate) {
                    const e = parseLocalDate(p.stockEndDate);
                    if (mStart > e) isWithinEnd = false;
                }

                if (s <= mEnd && isWithinEnd) {
                    sPart = p.stockAmount;
                } else {
                    sPart = 0;
                }
            }
            stockRevenue += sPart;
            flowRevenue += (rev - sPart);

            // Cost (PL)
            // Use wrappers that include commission accrual (now in Next Month)
            if (treatAsActualGlobal) {
                 cost += getProjectActualCost(p, employees, workLogs, year, month);
            } else {
                 cost += getProjectMonthlyCost(p, employees, year, month);
            }
        });

        const target = settings.salesTargets[monthKey] || settings.monthlySalesTarget || 0;

        // --- CF (Cash Flow) ---
        let cashIn = 0;
        
        projects.forEach(p => {
             // REVISED: Exclude Lost projects from Cash Flow
             if (p.status === ProjectStatus.Lost) return;

             // Flow Payment
             if (p.useFlow) {
                 if (p.billingConfig.flowSplit && p.billingConfig.flowMilestones && p.billingConfig.flowMilestones.length > 0) {
                     p.billingConfig.flowMilestones.forEach(m => {
                         const mDate = parseLocalDate(m.targetDate);
                         const payDate = getPaymentDate(mDate.getFullYear(), mDate.getMonth(), m.payDelay || 1, m.payDay || 99);
                         
                         if (payDate.getFullYear() === year && payDate.getMonth() === month) {
                             cashIn += m.amount;
                         }
                     });
                 } else {
                     if (p.flowEndDate) {
                         const e = parseLocalDate(p.flowEndDate);
                         const ePayDate = getPaymentDate(e.getFullYear(), e.getMonth(), 1, 99);
                         if (ePayDate.getFullYear() === year && ePayDate.getMonth() === month) {
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
        
        cashIn = Math.floor(cashIn * 1.1);

        // Cash Out: Expenses
        
        // 1. Labor Cost (Total Cash Out)
        // REVISED Logic: Sum up ALL Employee costs from Master for the previous month (Payment Term)
        const prevMonth = new Date(year, month - 1, 1);
        let totalLaborCostPrevMonth = 0;
        
        // A. Fixed Monthly Cost + Bonus (All Employees)
        employees.forEach(emp => {
            const { cost: empCost, bonus } = getEmployeeMonthlyData(emp, prevMonth.getFullYear(), prevMonth.getMonth());
            
            // Base Salary/Fee + Variable Bonus
            const totalEmpCost = empCost + (bonus || 0);

            // Tax Calculation: Contractor = Taxable (*1.1), FullTime = Non-Taxable (*1.0)
            const taxRate = emp.contractType === ContractType.Contractor ? 1.1 : 1.0;
            totalLaborCostPrevMonth += Math.floor(totalEmpCost * taxRate);
        });

        // B. Project Commission Payout (Paid month AFTER project completion)
        // This is variable cost ON TOP of fixed cost/bonus
        let commissionPayout = 0;
        
        projects.forEach(p => {
             if (p.status === ProjectStatus.Lost) return;

             // If project completed in PREVIOUS month, pay now.
             if (p.useFlow && p.flowEndDate) {
                 const endDate = parseLocalDate(p.flowEndDate);
                 if (endDate.getFullYear() === prevMonth.getFullYear() && endDate.getMonth() === prevMonth.getMonth()) {
                     commissionPayout += getSeniorEngineerCommission(p, employees);
                 }
             }
        });

        // Combine Labor + Commission Payout
        let paidCost = totalLaborCostPrevMonth;
        paidCost += Math.floor(commissionPayout * 1.1); // Commission is usually for contractors (Taxable)

        let sga = 0;
        let taxRepayment = 0;
        let investment = 0;
        let financialIn = 0;
        const financialInItems: { name: string, amount: number }[] = [];

        settings.cashFlowItems.forEach(item => {
            let occurs = false;
            let amountToAdd = 0;

            // Type 1: Variable (Time Charge)
            if (item.type === CashFlowType.Variable) {
                 const variableAmount = item.variableAmounts?.[monthKey] || 0;
                 if (variableAmount > 0) {
                     occurs = true;
                     amountToAdd = variableAmount;
                 }
            } 
            // Type 2: Recurring (Stock)
            // Or Legacy isRecurring = true
            else if (item.type === CashFlowType.Recurring || (item.type === undefined && item.isRecurring)) {
                if (item.periodStart) {
                    const start = parseLocalDate(`${item.periodStart}-01`);
                    const end = item.periodEnd ? parseLocalDate(`${item.periodEnd}-01`) : new Date(9999, 11, 31);
                    if (d >= start && d <= end) {
                        occurs = true;
                        amountToAdd = item.amount;
                    }
                }
            } 
            // Type 3: OneTime (Flow)
            // Or Legacy isRecurring = false
            else {
                const pDate = item.paymentDate ? parseLocalDate(item.paymentDate) : (item.targetMonth ? parseLocalDate(`${item.targetMonth}-01`) : null);
                if (pDate && pDate.getFullYear() === year && pDate.getMonth() === month) {
                    occurs = true;
                    amountToAdd = item.amount;
                }
            }

            if (occurs) {
                if (item.category === CashFlowCategory.OperatingExpense) sga += amountToAdd;
                else if (item.category === CashFlowCategory.Tax || item.category === CashFlowCategory.LoanRepayment) taxRepayment += amountToAdd;
                else if (item.category === CashFlowCategory.Investment) investment += amountToAdd;
                else if (item.category === CashFlowCategory.LoanIn) {
                    financialIn += amountToAdd;
                    financialInItems.push({ name: item.name, amount: amountToAdd });
                }
                else sga += amountToAdd;
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
            revenueActual,
            revenueForecast,
            flowRevenue,
            stockRevenue,
            cost: paidCost,
            sga,
            taxRepayment,
            investment,
            cashIn,
            financialIn,
            financialInItems,
            totalCashIn,
            totalCashOut,
            cashBalance: currentCash,
            cashBalanceChange
        });
    }
    
    return data;
};

export const generateDailyCashFlow = (date: Date, projects: Project[], employees: Employee[], workLogs: WorkLog[], settings: AppSettings, initialBalance: number) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const daysInMonth = getTotalDays(year, month);
    const data = [];
    let currentBalance = initialBalance;
    
    const dailyChanges: Record<number, number> = {};

    // 1. Calculate Inflows 
    
    projects.forEach(p => {
        // REVISED: Exclude Lost
        if (p.status === ProjectStatus.Lost) return;

        // --- Current Month Inflows ---
        if (p.useFlow) {
             if (p.billingConfig.flowSplit && p.billingConfig.flowMilestones && p.billingConfig.flowMilestones.length > 0) {
                 p.billingConfig.flowMilestones.forEach(m => {
                     const mDate = parseLocalDate(m.targetDate);
                     const payDate = getPaymentDate(mDate.getFullYear(), mDate.getMonth(), m.payDelay || 1, m.payDay || 99);
                     
                     if (payDate.getFullYear() === year && payDate.getMonth() === month) {
                         dailyChanges[payDate.getDate()] = (dailyChanges[payDate.getDate()] || 0) + Math.floor(m.amount * 1.1);
                     }
                 });
             } else {
                 if (p.flowEndDate) {
                     const e = parseLocalDate(p.flowEndDate);
                     const ePayDate = getPaymentDate(e.getFullYear(), e.getMonth(), 1, 99);
                     if (ePayDate.getFullYear() === year && ePayDate.getMonth() === month) {
                         dailyChanges[ePayDate.getDate()] = (dailyChanges[ePayDate.getDate()] || 0) + Math.floor(p.flowAmount * 1.1);
                     }
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

    // 2. Labor Cost Payout (End of This Month = Payment for Last Month's WORK)
    const prevMonthDate = new Date(year, month - 1, 1);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = prevMonthDate.getMonth();

    let prevMonthLaborCost = 0;
    let commissionPayoutThisMonth = 0;

    // A. Fixed Monthly Cost + Bonus (All Employees)
    employees.forEach(emp => {
        const { cost: empCost, bonus } = getEmployeeMonthlyData(emp, prevYear, prevMonth);
        const taxRate = emp.contractType === ContractType.Contractor ? 1.1 : 1.0;
        prevMonthLaborCost += Math.floor((empCost + (bonus || 0)) * taxRate);
    });

    // B. Commission
    projects.forEach(p => {
        if (p.status === ProjectStatus.Lost) return;

        // Calculate Commission Payout (if project completed in prev month)
        if (p.useFlow && p.flowEndDate) {
            const endDate = parseLocalDate(p.flowEndDate);
            if (endDate.getFullYear() === prevYear && endDate.getMonth() === prevMonth) {
                 commissionPayoutThisMonth += getSeniorEngineerCommission(p, employees);
            }
        }
    });

    // Payout Date: End of Month (Default for Labor)
    const payDay = daysInMonth;

    // Add Standard Labor Cost
    if (prevMonthLaborCost > 0) {
        dailyChanges[payDay] = (dailyChanges[payDay] || 0) - prevMonthLaborCost;
    }
    
    // Add Commission Cost (with 10% tax)
    if (commissionPayoutThisMonth > 0) {
        dailyChanges[payDay] = (dailyChanges[payDay] || 0) - Math.floor(commissionPayoutThisMonth * 1.1);
    }

    // 3. Other Expenses
    settings.cashFlowItems.forEach(item => {
        let occurs = false;
        let day = 1;
        let amountToAdd = 0;
        
        // Type 1: Variable
        if (item.type === CashFlowType.Variable) {
             const variableAmount = item.variableAmounts?.[monthKey] || 0;
             if (variableAmount > 0) {
                 occurs = true;
                 day = item.payDay === 99 ? daysInMonth : (item.payDay || 25);
                 amountToAdd = variableAmount;
             }
        }
        // Type 2: Recurring
        else if (item.type === CashFlowType.Recurring || (item.type === undefined && item.isRecurring)) {
            if (item.periodStart) {
                const start = parseLocalDate(`${item.periodStart}-01`);
                const end = item.periodEnd ? parseLocalDate(`${item.periodEnd}-01`) : new Date(9999, 11, 31);
                const d = new Date(year, month, 1);
                if (d >= start && d <= end) {
                    occurs = true;
                    day = item.payDay === 99 ? daysInMonth : (item.payDay || 25);
                    amountToAdd = item.amount;
                }
            }
        } 
        // Type 3: OneTime
        else {
             const pDate = item.paymentDate ? parseLocalDate(item.paymentDate) : (item.targetMonth ? parseLocalDate(`${item.targetMonth}-01`) : null);
             if (pDate && pDate.getFullYear() === year && pDate.getMonth() === month) {
                 occurs = true;
                 day = pDate.getDate();
                 amountToAdd = item.amount;
             }
        }

        if (occurs) {
            const sign = (item.category === CashFlowCategory.LoanIn) ? 1 : -1;
            dailyChanges[day] = (dailyChanges[day] || 0) + (amountToAdd * sign);
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
