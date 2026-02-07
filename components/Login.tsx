import React, { useState } from 'react';

interface LoginProps {
  onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.endsWith('@irwin-and-co.com')) {
      onLogin();
    } else {
      setError('irwin-and-co.com のメールアドレスのみログイン可能です。');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-md p-8">
        <div className="flex flex-col items-center justify-center mb-10">
          {/* Logo updated to match the "I&C" image: Blue, Serif, Large */}
          <div className="text-8xl font-serif font-bold text-blue-900 tracking-tighter select-none" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
            I&C
          </div>
        </div>
        
        <div className="bg-white p-8 border border-blue-100 rounded-lg shadow-lg">
           <h2 className="text-xl font-bold text-center text-blue-900 mb-6">管理会計システム</h2>
           <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-blue-900 mb-2">メールアドレス</label>
              <input
                type="email"
                required
                className="w-full px-4 py-3 border border-blue-200 rounded-md focus:ring-2 focus:ring-blue-900 focus:border-blue-900 focus:outline-none placeholder-blue-300 text-blue-900"
                placeholder="user@irwin-and-co.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error && (
              <p className="text-red-500 text-sm font-medium">{error}</p>
            )}
            <button
              type="submit"
              className="w-full bg-blue-900 text-white py-3 rounded-md hover:bg-blue-800 transition duration-200 font-semibold shadow-md"
            >
              ログイン
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;