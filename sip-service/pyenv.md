# Install Python 3.12 via pyenv
pyenv install 3.12
pyenv local 3.12    # sets Python 3.12 for this project

# Verify pyenv is active
which python        # should show ~/.pyenv/shims/python
python --version    # should show Python 3.12.x
